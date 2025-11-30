// import { CdpClient } from "@coinbase/cdp-sdk"; // Removed - using Celo native
import { Hex, createPublicClient, encodeAbiParameters, http, keccak256, parseUnits, stringToBytes, zeroAddress } from "viem";
import { celo, celoAlfajores } from "viem/chains";
import SharedEscrowArtifact from "./abi/SharedEscrow.json";
import { PAYMASTER_API_URL, CUSD_TOKEN_ADDRESS } from "../../config/celo.server";

const { abi: SHARED_ESCROW_ABI } = SharedEscrowArtifact;

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const UINT96_MAX = (1n << 96n) - 1n;
const UINT40_MAX = (1n << 40n) - 1n;
// Type for user operation result (Celo native transactions)
type UserOpResult = { hash: string };

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
  userOpHash: Hex;
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
  // Removed CdpClient - using Celo native transactions
  private readonly network: EscrowNetwork;
  private readonly chain;
  private readonly paymasterUrl: string;
  private readonly contractAddress: `0x${string}`;
  private readonly tokenAddress: `0x${string}`;
  private readonly fundingWallet: `0x${string}`;
  private readonly expirySeconds: number;
  private readonly saltBytes32: Hex;
  private publicClient;
  private readonly backendAccountName: string;
  private readonly backendSmartAccountName: string;

  constructor() {
    this.network = (process.env.ESCROW_NETWORK as EscrowNetwork) || "celo-alfajores";
    this.chain = NETWORK_CHAIN_MAP[this.network];
    this.paymasterUrl = process.env.PAYMASTER_URL || PAYMASTER_API_URL;
    this.contractAddress = (process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`) ?? (() => {
      throw new Error("ESCROW_CONTRACT_ADDRESS env var is required");
    })();
    this.tokenAddress = (process.env.ESCROW_TOKEN_ADDRESS as `0x${string}`) || CUSD_TOKEN_ADDRESS;
    this.fundingWallet = (process.env.ESCROW_TREASURY_WALLET as `0x${string}`) ?? (() => {
      throw new Error("ESCROW_TREASURY_WALLET env var is required");
    })();
    this.expirySeconds = Number(process.env.ESCROW_EXPIRY_SECONDS ?? 7 * 24 * 60 * 60);
    this.backendAccountName = process.env.CDP_BACKEND_ACCOUNT_NAME || "oweza-backend";
    this.backendSmartAccountName = process.env.CDP_BACKEND_SMART_ACCOUNT_NAME || "oweza-escrow";
    const salt = process.env.ESCROW_SALT_VERSION || "MS_ESCROW_V1";
    this.saltBytes32 = keccak256(stringToBytes(salt)) as Hex;
    const rpcUrl = process.env.ESCROW_RPC_URL || this.chain.rpcUrls.default.http[0];
    this.publicClient = createPublicClient({ chain: this.chain, transport: http(rpcUrl) });
  }

  async createTransfer(input: CreateEscrowTransferInput): Promise<EscrowTransferReceipt> {
    const smartAccount = await this.getSmartAccount();
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

    const createCalls = [
      {
        to: this.contractAddress,
        value: 0n,
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
      },
    ];

    // TODO: Implement with Celo native transactions (removed CDP SDK)
    throw new Error("createTransfer not yet implemented with Celo native transactions");
    
    // return {
    //   transferId,
    //   recipientHash,
    //   expiry,
    //   userOpHash: "0x" as Hex,
    // };
  }

  async claimTransfer(transferId: Hex, recipientAddress: `0x${string}`, recipientEmail: string): Promise<EscrowClaimReceipt> {
    const smartAccount = await this.getSmartAccount();
    const recipientHash = this.computeRecipientHash(recipientEmail.trim().toLowerCase());

    const claimCalls = [
      {
        to: this.contractAddress,
        value: 0n,
        abi: SHARED_ESCROW_ABI,
        functionName: "claimTransfer",
        args: [transferId, recipientAddress, recipientHash],
      },
    ];

    // TODO: Implement with Celo native transactions (removed CDP SDK)
    throw new Error("claimTransfer not yet implemented with Celo native transactions");
    
    // return { transferId, userOpHash: "0x" as Hex };
  }

  async refundTransfer(transferId: Hex, refundAddress: `0x${string}`): Promise<EscrowRefundReceipt> {
    const smartAccount = await this.getSmartAccount();

    const refundCalls = [
      {
        to: this.contractAddress,
        value: 0n,
        abi: SHARED_ESCROW_ABI,
        functionName: "refundTransfer",
        args: [transferId, refundAddress],
      },
    ];

    // TODO: Implement with Celo native transactions (removed CDP SDK)
    throw new Error("refundTransfer not yet implemented with Celo native transactions");
    
    // return { transferId, userOpHash: "0x" as Hex };
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

  // TODO: Implement smart account management with Celo native approach
  // private async getSmartAccount() {
  //   throw new Error("Smart account not yet implemented with Celo native transactions");
  // }
}

export const sharedEscrowDriver = new SharedEscrowDriver();
export type SharedEscrowDriverType = SharedEscrowDriver;
