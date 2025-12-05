import { Hex, createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, parseUnits, zeroAddress, randomBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoAlfajores } from "viem/chains";
import HTLCEscrowArtifact from "./abi/HTLCEscrow.json";

const { abi: HTLC_ESCROW_ABI } = HTLCEscrowArtifact;

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const UINT96_MAX = (1n << 96n) - 1n;
const UINT40_MAX = (1n << 40n) - 1n;

// Default Celo cUSD addresses
const DEFAULT_CUSD_MAINNET = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const DEFAULT_CUSD_ALFAJORES = "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1";

// Helper to get constants safely in RN or Node
const getConfig = () => {
    if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
        try {
            const Constants = require("expo-constants").default;
            return Constants?.expoConfig?.extra || {};
        } catch (e) {
            return {};
        }
    }
    return process.env;
};

export type EscrowNetwork = "celo" | "celo-alfajores";

export type CreateHTLCTransferInput = {
    recipientEmail: string;
    amount: string;
    decimals: number;
    tokenAddress?: `0x${string}`;
    expiry?: number;
    fundingWallet?: `0x${string}`;
};

export type HTLCTransferReceipt = {
    transferId: Hex;
    hashLock: Hex;
    secret: Hex; // IMPORTANT: Store this securely, send to recipient
    expiry: number;
    userOpHash: Hex;
    callData?: Hex;
    to?: Hex;
    value?: bigint;
};

export type HTLCClaimReceipt = {
    transferId: Hex;
    userOpHash: Hex;
};

export type HTLCRefundReceipt = {
    transferId: Hex;
    userOpHash: Hex;
};

export type OnchainHTLCTransferState = {
    sender: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
    hashLock: Hex;
    expiry: number;
    status: number;
};

const NETWORK_CHAIN_MAP: Record<EscrowNetwork, typeof celo | typeof celoAlfajores> = {
    celo,
    "celo-alfajores": celoAlfajores,
};

class HTLCEscrowDriver {
    private readonly network: EscrowNetwork;
    private readonly chain;
    private readonly contractAddress: `0x${string}`;
    private readonly tokenAddress: `0x${string}`;
    private readonly fundingWallet: `0x${string}`;
    private readonly expirySeconds: number;
    private publicClient;
    private walletClient;

    constructor() {
        const config = getConfig();

        this.network = (config.ESCROW_NETWORK || config.web3authNetwork === "sapphire_mainnet" ? "celo" : "celo-alfajores") as EscrowNetwork;
        this.chain = NETWORK_CHAIN_MAP[this.network];

        // Get contract address from config
        const addr = config.HTLC_CONTRACT_ADDRESS || config.htlcContractAddress || config.ESCROW_CONTRACT_ADDRESS || config.escrowContractAddress;
        if (!addr) {
            console.warn("⚠️ HTLC_CONTRACT_ADDRESS not set. Escrow functions may fail.");
        }
        this.contractAddress = (addr as `0x${string}`) || zeroAddress;

        // Get token address
        const tokenAddr = config.ESCROW_TOKEN_ADDRESS || config.escrowTokenAddress;
        const defaultToken = this.network === "celo" ? DEFAULT_CUSD_MAINNET : DEFAULT_CUSD_ALFAJORES;
        this.tokenAddress = (tokenAddr as `0x${string}`) || defaultToken;

        // Get treasury wallet
        const treasury = config.ESCROW_TREASURY_WALLET || config.escrowTreasuryWallet;
        this.fundingWallet = (treasury as `0x${string}`) || zeroAddress;

        this.expirySeconds = Number(config.ESCROW_EXPIRY_SECONDS || 7 * 24 * 60 * 60);

        const rpcUrl = config.ESCROW_RPC_URL || this.chain.rpcUrls.default.http[0];
        this.publicClient = createPublicClient({ chain: this.chain, transport: http(rpcUrl) });

        // Initialize wallet client if private key is available
        const relayerKey = config.ESCROW_RELAYER_PRIVATE_KEY;
        if (relayerKey) {
            try {
                const account = privateKeyToAccount(relayerKey as `0x${string}`);
                this.walletClient = createWalletClient({
                    account,
                    chain: this.chain,
                    transport: http(rpcUrl)
                });
                console.log("✅ HTLCEscrowDriver: Wallet client initialized");
            } catch (error) {
                console.error("❌ HTLCEscrowDriver: Failed to initialize wallet client", error);
            }
        }
    }

    /**
     * Generate a cryptographically secure random secret
     */
    generateSecret(): Hex {
        const secretBytes = randomBytes(32);
        return toHex(secretBytes);
    }

    /**
     * Compute hash lock from secret
     */
    computeHashLock(secret: Hex): Hex {
        return keccak256(secret);
    }

    /**
     * Compute transfer ID
     */
    computeTransferId(hashLock: Hex, amount: bigint, expiry: number): Hex {
        // Simple deterministic ID based on hashLock, amount, and expiry
        return keccak256(
            `0x${hashLock.slice(2)}${amount.toString(16).padStart(24, '0')}${expiry.toString(16).padStart(10, '0')}`
        );
    }

    /**
     * Create a transfer with HTLC escrow
     * Generates secret, computes hashLock, locks funds
     */
    async createTransfer(input: CreateHTLCTransferInput): Promise<HTLCTransferReceipt> {
        const amountAtomic = parseUnits(input.amount, input.decimals);

        if (amountAtomic <= 0n) {
            throw new Error("Amount must be greater than zero");
        }
        if (amountAtomic > UINT96_MAX) {
            throw new Error("Amount exceeds uint96 range");
        }

        const expiry = input.expiry ?? Math.floor(Date.now() / 1000 + this.expirySeconds);
        if (expiry > Number(UINT40_MAX)) {
            throw new Error("Expiry exceeds uint40 range");
        }

        // Generate secret and hash lock
        const secret = this.generateSecret();
        const hashLock = this.computeHashLock(secret);
        const transferId = this.computeTransferId(hashLock, amountAtomic, expiry);

        // Encode the function call
        const callData = encodeFunctionData({
            abi: HTLC_ESCROW_ABI,
            functionName: "lockFunds",
            args: [
                {
                    transferId,
                    token: input.tokenAddress ?? this.tokenAddress,
                    fundingWallet: input.fundingWallet ?? this.fundingWallet,
                    amount: amountAtomic,
                    hashLock,
                    expiry,
                },
                {
                    enabled: false,
                    value: 0n,
                    deadline: 0,
                    v: 0,
                    r: ZERO_HASH,
                    s: ZERO_HASH,
                },
            ],
        });

        // Execute transaction if wallet client is available
        if (this.walletClient) {
            try {
                const hash = await this.walletClient.writeContract({
                    address: this.contractAddress,
                    abi: HTLC_ESCROW_ABI,
                    functionName: "lockFunds",
                    args: [
                        {
                            transferId,
                            token: input.tokenAddress ?? this.tokenAddress,
                            fundingWallet: input.fundingWallet ?? this.fundingWallet,
                            amount: amountAtomic,
                            hashLock,
                            expiry,
                        },
                        {
                            enabled: false,
                            value: 0n,
                            deadline: 0,
                            v: 0,
                            r: ZERO_HASH,
                            s: ZERO_HASH,
                        },
                    ],
                });
                console.log(`✅ HTLC transfer locked: ${hash}`);
                return {
                    transferId,
                    hashLock,
                    secret, // CRITICAL: Store this securely!
                    expiry,
                    userOpHash: hash,
                    callData,
                    to: this.contractAddress,
                    value: 0n
                };
            } catch (error) {
                console.error("❌ Failed to execute HTLC lock transaction:", error);
                throw error;
            }
        }

        console.warn("⚠️ No wallet client configured - generating call data only");

        return {
            transferId,
            hashLock,
            secret,
            expiry,
            userOpHash: "0x", // Placeholder
            callData,
            to: this.contractAddress,
            value: 0n
        };
    }

    /**
     * Claim transfer with secret (gasless for recipient)
     * Backend relayer calls this to send funds to recipient
     */
    async claimToRecipient(
        transferId: Hex,
        secret: Hex,
        recipientAddress: `0x${string}`
    ): Promise<HTLCClaimReceipt> {
        if (!this.walletClient) {
            throw new Error("Server wallet not configured. Cannot execute gasless claim.");
        }

        try {
            const hash = await this.walletClient.writeContract({
                address: this.contractAddress,
                abi: HTLC_ESCROW_ABI,
                functionName: "claimTo",
                args: [transferId, secret, recipientAddress],
            });
            console.log(`✅ HTLC claim transaction sent: ${hash}`);
            return { transferId, userOpHash: hash };
        } catch (error) {
            console.error("❌ Failed to execute HTLC claim transaction:", error);
            throw error;
        }
    }

    /**
     * Refund expired transfer
     */
    async refundTransfer(transferId: Hex): Promise<HTLCRefundReceipt> {
        if (!this.walletClient) {
            throw new Error("Server wallet not configured. Cannot execute refund.");
        }

        try {
            const hash = await this.walletClient.writeContract({
                address: this.contractAddress,
                abi: HTLC_ESCROW_ABI,
                functionName: "refund",
                args: [transferId],
            });
            console.log(`✅ HTLC refund transaction sent: ${hash}`);
            return { transferId, userOpHash: hash };
        } catch (error) {
            console.error("❌ Failed to execute HTLC refund transaction:", error);
            throw error;
        }
    }

    /**
     * Load transfer state from blockchain
     */
    async loadOnchainTransfer(transferId: Hex): Promise<OnchainHTLCTransferState | null> {
        try {
            const result = await this.publicClient.readContract({
                address: this.contractAddress,
                abi: HTLC_ESCROW_ABI,
                functionName: "getTransfer",
                args: [transferId],
            });
            const normalized = result as unknown as {
                sender: `0x${string}`;
                token: `0x${string}`;
                amount: bigint;
                hashLock: Hex;
                expiry: bigint;
                status: number;
            };

            if (normalized.sender === zeroAddress && normalized.amount === 0n) {
                return null;
            }
            return {
                sender: normalized.sender,
                token: normalized.token,
                amount: normalized.amount,
                hashLock: normalized.hashLock,
                expiry: Number(normalized.expiry),
                status: normalized.status,
            };
        } catch (error) {
            console.error("Failed to read HTLC transfer", error);
            return null;
        }
    }

    /**
     * Get transfer status
     */
    async getTransferStatus(transferId: Hex): Promise<'pending' | 'claimed' | 'refunded' | 'cancelled' | null> {
        const snapshot = await this.loadOnchainTransfer(transferId);
        if (!snapshot) {
            return null;
        }

        // Map HTLC status codes: 0=None, 1=Locked, 2=Claimed, 3=Refunded, 4=Cancelled
        switch (snapshot.status) {
            case 1:
                return 'pending';
            case 2:
                return 'claimed';
            case 3:
                return 'refunded';
            case 4:
                return 'cancelled';
            default:
                return null;
        }
    }
}

export const htlcEscrowDriver = new HTLCEscrowDriver();
export type HTLCEscrowDriverType = HTLCEscrowDriver;
