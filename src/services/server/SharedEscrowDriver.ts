// import { CdpClient } from "@coinbase/cdp-sdk"; // Removed - using Celo native
import { Hex, createPublicClient, createWalletClient, encodeAbiParameters, http, keccak256, parseUnits, stringToBytes, zeroAddress, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoAlfajores } from "viem/chains";
import SharedEscrowArtifact from "./abi/SharedEscrow.json";
// import { PAYMASTER_API_URL, CUSD_TOKEN_ADDRESS } from "../../config/celo.server"; // Removed server-only import

const { abi: SHARED_ESCROW_ABI } = SharedEscrowArtifact;

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const UINT96_MAX = (1n << 96n) - 1n;
const UINT40_MAX = (1n << 40n) - 1n;

// Default Celo Alfajores CUSD if not in env
const DEFAULT_CUSD_ADDRESS = "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1";

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

export type CreateEscrowTransferInput = {
  recipientEmail: string;
  amount: string;
  decimals: number;
  tokenAddress?: `0x${string}`;
  expiry?: number;
  fundingWallet?: `0x${string}`;
};

export type EscrowTransferReceipt = {
  transferId: Hex;
  recipientHash: Hex;
  expiry: number;
  userOpHash: Hex; // In RN, this will be the hash returned by the smart account
  callData?: Hex; // Added for Celo Fee Abstraction flow
  to?: Hex;      // Added for Celo Fee Abstraction flow
  value?: bigint; // Added for Celo Fee Abstraction flow
};

export type EscrowClaimReceipt = {
  transferId: Hex;
  userOpHash: Hex;
};

export type EscrowRefundReceipt = {
  transferId: Hex;
  userOpHash: Hex;
};

export type OnchainTransferState = {
  sender: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  recipientHash: Hex;
  expiry: number;
  status: number;
};

const NETWORK_CHAIN_MAP: Record<EscrowNetwork, typeof celo | typeof celoAlfajores> = {
  celo,
  "celo-alfajores": celoAlfajores,
};

class SharedEscrowDriver {
  private readonly network: EscrowNetwork;
  private readonly chain;
  private readonly contractAddress: `0x${string}`;
  private readonly tokenAddress: `0x${string}`;
  private readonly fundingWallet: `0x${string}`;
  private readonly expirySeconds: number;
  private readonly saltBytes32: Hex;
  private publicClient;
  private walletClient;

  constructor() {
    const config = getConfig();

    this.network = (config.ESCROW_NETWORK || config.web3authNetwork === "sapphire_mainnet" ? "celo" : "celo-alfajores") as EscrowNetwork;
    this.chain = NETWORK_CHAIN_MAP[this.network];

    // Get contract address from config
    const addr = config.ESCROW_CONTRACT_ADDRESS || config.escrowContractAddress;
    if (!addr) {
      console.warn("⚠️ ESCROW_CONTRACT_ADDRESS not set. Escrow functions may fail.");
    }
    this.contractAddress = (addr as `0x${string}`) || zeroAddress;

    // Get token address
    const tokenAddr = config.ESCROW_TOKEN_ADDRESS || config.escrowTokenAddress;
    this.tokenAddress = (tokenAddr as `0x${string}`) || DEFAULT_CUSD_ADDRESS;

    // Get treasury wallet
    const treasury = config.ESCROW_TREASURY_WALLET || config.escrowTreasuryWallet;
    this.fundingWallet = (treasury as `0x${string}`) || zeroAddress;

    this.expirySeconds = Number(config.ESCROW_EXPIRY_SECONDS || 7 * 24 * 60 * 60);

    const salt = config.ESCROW_SALT_VERSION || "MS_ESCROW_V1";
    this.saltBytes32 = keccak256(stringToBytes(salt)) as Hex;

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
        console.log("✅ SharedEscrowDriver: Wallet client initialized");
      } catch (error) {
        console.error("❌ SharedEscrowDriver: Failed to initialize wallet client", error);
      }
    }
  }

  /**
   * Generates the transaction data for creating an escrow transfer.
   * In React Native, this returns the call data to be executed by the Smart Account.
   */
  async createTransfer(input: CreateEscrowTransferInput): Promise<EscrowTransferReceipt> {
    const normalizedEmail = input.recipientEmail.trim().toLowerCase();
    const recipientHash = this.computeRecipientHash(normalizedEmail);
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

    const transferId = this.computeTransferId(recipientHash, amountAtomic, expiry);

    // Encode the function call
    const callData = encodeFunctionData({
      abi: SHARED_ESCROW_ABI,
      functionName: "createTransfer",
      args: [
        {
          transferId,
          token: input.tokenAddress ?? this.tokenAddress,
          fundingWallet: input.fundingWallet ?? this.fundingWallet,
          amount: amountAtomic,
          recipientHash,
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
          abi: SHARED_ESCROW_ABI,
          functionName: "createTransfer",
          args: [
            {
              transferId,
              token: input.tokenAddress ?? this.tokenAddress,
              fundingWallet: input.fundingWallet ?? this.fundingWallet,
              amount: amountAtomic,
              recipientHash,
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
        console.log(`✅ Create transfer transaction sent: ${hash}`);
        return {
          transferId,
          recipientHash,
          expiry,
          userOpHash: hash,
          callData,
          to: this.contractAddress,
          value: 0n
        };
      } catch (error) {
        console.error("❌ Failed to execute create transfer transaction:", error);
        throw error;
      }
    }

    console.warn("⚠️ No wallet client configured - generating call data only");

    // Return the data needed to execute the transaction
    return {
      transferId,
      recipientHash,
      expiry,
      userOpHash: "0x", // Placeholder, will be filled by the executor
      callData,
      to: this.contractAddress,
      value: 0n
    };
  }

  async claimTransfer(transferId: Hex, recipientAddress: `0x${string}`, recipientEmail: string): Promise<EscrowClaimReceipt> {
    const recipientHash = this.computeRecipientHash(recipientEmail.trim().toLowerCase());

    if (this.walletClient) {
      try {
        const hash = await this.walletClient.writeContract({
          address: this.contractAddress,
          abi: SHARED_ESCROW_ABI,
          functionName: "claimTransfer",
          args: [transferId, recipientAddress, recipientHash],
        });
        console.log(`✅ Claim transaction sent: ${hash}`);
        return { transferId, userOpHash: hash };
      } catch (error) {
        console.error("❌ Failed to execute claim transaction:", error);
        throw error;
      }
    }

    console.warn("⚠️ No wallet client configured - generating call data only");
    // For claim/refund, we must execute the transaction or fail, as we don't return callData for client execution
    throw new Error("Server wallet not configured. Cannot execute claim transaction.");
  }

  async refundTransfer(transferId: Hex, refundAddress: `0x${string}`): Promise<EscrowRefundReceipt> {
    if (this.walletClient) {
      try {
        const hash = await this.walletClient.writeContract({
          address: this.contractAddress,
          abi: SHARED_ESCROW_ABI,
          functionName: "refundTransfer",
          args: [transferId, refundAddress],
        });
        console.log(`✅ Refund transaction sent: ${hash}`);
        return { transferId, userOpHash: hash };
      } catch (error) {
        console.error("❌ Failed to execute refund transaction:", error);
        throw error;
      }
    }

    console.warn("⚠️ No wallet client configured - generating call data only");
    // For claim/refund, we must execute the transaction or fail
    throw new Error("Server wallet not configured. Cannot execute refund transaction.");
  }

  async loadOnchainTransfer(transferId: Hex): Promise<OnchainTransferState | null> {
    try {
      const result = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: SHARED_ESCROW_ABI,
        functionName: "getTransfer",
        args: [transferId],
      });
      const normalized = result as unknown as {
        sender: `0x${string}`;
        token: `0x${string}`;
        amount: bigint;
        recipientHash: Hex;
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
        recipientHash: normalized.recipientHash,
        expiry: Number(normalized.expiry),
        status: normalized.status,
      };
    } catch (error) {
      console.error("Failed to read transfer", error);
      return null;
    }
  }

  computeRecipientHash(email: string): Hex {
    return keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "string" },
        ],
        [this.saltBytes32, email],
      ),
    ) as Hex;
  }

  computeTransferId(recipientHash: Hex, amount: bigint, expiry: number): Hex {
    return keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint96" },
          { type: "uint40" },
        ],
        [this.saltBytes32, recipientHash, amount, expiry],
      ),
    ) as Hex;
  }
}

export const sharedEscrowDriver = new SharedEscrowDriver();
export type SharedEscrowDriverType = SharedEscrowDriver;
