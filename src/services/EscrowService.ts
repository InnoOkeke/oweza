import { ChainType } from "../types/database";

declare const require: any;

const isReactNative = typeof navigator !== "undefined" && navigator.product === "ReactNative";

type ExpoExtra = {
  escrowMockMode?: boolean;
};

export type EscrowCreateRequest = {
  recipientEmail: string;
  amount: string;
  decimals: number;
  tokenAddress: string;
  chain: ChainType;
  expiry?: number;
};

export type EscrowCreateResult = {
  transferId: string;
  recipientHash: string;
  expiry: number;
  txHash: string;
};

export type EscrowClaimResult = {
  transferId: string;
  txHash: string;
};

export type EscrowRefundResult = {
  transferId: string;
  txHash: string;
};

export type OnchainTransferSnapshot = {
  sender: string;
  token: string;
  amount: string;
  recipientHash: string;
  expiry: number;
  status: number;
};

class EscrowService {
  private readonly extra: ExpoExtra;
  private readonly IS_MOCK_MODE: boolean;
  private driverPromise: Promise<typeof import("./server/SharedEscrowDriver") | null> | null = null;

  constructor() {
    this.extra = this.loadExpoExtra();
    this.IS_MOCK_MODE = this.resolveMockMode();
  }

  async createOnchainTransfer(request: EscrowCreateRequest): Promise<EscrowCreateResult> {
    if (request.chain !== "celo") {
      throw new Error(`Unsupported chain ${request.chain} for shared escrow`);
    }

    if (this.IS_MOCK_MODE) {
      return this.createMockTransfer(request);
    }

    const driver = await this.requireDriver();
    if (!driver) {
      throw new Error("Escrow driver unavailable in this environment");
    }

    const receipt = await driver.sharedEscrowDriver.createTransfer({
      recipientEmail: request.recipientEmail,
      amount: request.amount,
      decimals: request.decimals,
      tokenAddress: request.tokenAddress as `0x${string}`,
      expiry: request.expiry,
    });

    return {
      transferId: receipt.transferId,
      recipientHash: receipt.recipientHash,
      expiry: receipt.expiry,
      txHash: receipt.userOpHash,
    };
  }

  async claimOnchainTransfer(
    transferId: string,
    recipientAddress: string,
    recipientEmail: string
  ): Promise<EscrowClaimResult> {
    if (this.IS_MOCK_MODE) {
      return {
        transferId,
        txHash: this.mockHash(),
      };
    }

    const driver = await this.requireDriver();
    if (!driver) {
      throw new Error("Escrow driver unavailable in this environment");
    }

    const receipt = await driver.sharedEscrowDriver.claimTransfer(
      transferId as `0x${string}`,
      recipientAddress as `0x${string}`,
      recipientEmail.toLowerCase()
    );

    return {
      transferId,
      txHash: receipt.userOpHash,
    };
  }

  async refundOnchainTransfer(transferId: string, refundAddress: string): Promise<EscrowRefundResult> {
    if (this.IS_MOCK_MODE) {
      return {
        transferId,
        txHash: this.mockHash(),
      };
    }

    const driver = await this.requireDriver();
    if (!driver) {
      throw new Error("Escrow driver unavailable in this environment");
    }

    const receipt = await driver.sharedEscrowDriver.refundTransfer(
      transferId as `0x${string}`,
      refundAddress as `0x${string}`
    );

    return {
      transferId,
      txHash: receipt.userOpHash,
    };
  }

  async getOnchainTransfer(transferId: string): Promise<OnchainTransferSnapshot | null> {
    if (this.IS_MOCK_MODE) {
      return null;
    }

    const driver = await this.requireDriver();
    if (!driver) {
      return null;
    }

    const state = await driver.sharedEscrowDriver.loadOnchainTransfer(transferId as `0x${string}`);
    if (!state) {
      return null;
    }

    return {
      sender: state.sender,
      token: state.token,
      amount: state.amount.toString(),
      recipientHash: state.recipientHash,
      expiry: state.expiry,
      status: state.status,
    };
  }

  /**
   * Get the current status of a transfer from blockchain
   * Status codes: 0 = pending, 1 = claimed, 2 = refunded/cancelled
   */
  async getTransferStatus(transferId: string): Promise<'pending' | 'claimed' | 'cancelled' | null> {
    const snapshot = await this.getOnchainTransfer(transferId);
    if (!snapshot) {
      return null;
    }

    // Map status codes from contract
    switch (snapshot.status) {
      case 0:
        return 'pending';
      case 1:
        return 'claimed';
      case 2:
        return 'cancelled';
      default:
        return null;
    }
  }

  /**
   * Check if a transfer can be claimed
   */
  async isTransferClaimable(transferId: string): Promise<boolean> {
    const snapshot = await this.getOnchainTransfer(transferId);
    if (!snapshot) {
      return false;
    }

    // Can claim if status is pending (0) and not expired
    const now = Math.floor(Date.now() / 1000);
    return snapshot.status === 0 && snapshot.expiry > now;
  }

  /**
   * Check if a transfer can be cancelled/refunded
   */
  async isTransferCancellable(transferId: string): Promise<boolean> {
    const snapshot = await this.getOnchainTransfer(transferId);
    if (!snapshot) {
      return false;
    }

    // Can cancel if status is pending (0)
    return snapshot.status === 0;
  }

  isMockMode() {
    return this.IS_MOCK_MODE;
  }

  private loadExpoExtra(): ExpoExtra {
    if (!isReactNative) {
      return {};
    }

    try {
      const Constants = require("expo-constants").default;
      return (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;
    } catch (_error) {
      return {};
    }
  }

  private resolveMockMode(): boolean {
    if (isReactNative) {
      return Boolean(this.extra?.escrowMockMode);
    }
    if (process.env.ESCROW_USE_MOCK) {
      return process.env.ESCROW_USE_MOCK !== "false";
    }
    return false;
  }

  private async requireDriver() {
    if (isReactNative) {
      return null;
    }

    if (!this.driverPromise) {
      this.driverPromise = import("./server/SharedEscrowDriver.js");
    }

    return this.driverPromise;
  }

  private createMockTransfer(request: EscrowCreateRequest): EscrowCreateResult {
    const transferId = this.mockHash();
    const recipientHash = this.mockHash();
    const expiry = request.expiry ?? Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    return {
      transferId,
      recipientHash,
      expiry,
      txHash: this.mockHash(),
    };
  }

  private mockHash(): string {
    return `0xmock${Math.random().toString(16).slice(2).padEnd(60, "0")}`.slice(0, 66);
  }
}

export const escrowService = new EscrowService();
