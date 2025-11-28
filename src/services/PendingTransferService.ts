/**
 * Pending Transfer Service
 * Manages pending transfers for non-registered recipients
 */

import { z } from "zod";
import mongoDatabase from "./mongoDatabase";
import { escrowService } from "./EscrowService";
import { emailNotificationService } from "./EmailNotificationService";
import { userDirectoryService } from "./UserDirectoryService";
import { PendingTransfer, ChainType } from "../types/database";

declare const require: any;

type ExpoExtra = {
  metasendApiBaseUrl?: string;
  metasendApiKey?: string;
};

const isReactNative = typeof navigator !== "undefined" && navigator.product === "ReactNative";

const getExpoExtra = (): ExpoExtra => {
  if (!isReactNative) {
    return {};
  }

  try {
    const Constants = require("expo-constants").default;
    return (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;
  } catch (_error) {
    return {};
  }
};

export const CreatePendingTransferSchema = z.object({
  recipientEmail: z.string().email(),
  senderUserId: z.string(),
  amount: z.string(),
  token: z.string(),
  tokenAddress: z.string(),
  chain: z.enum(["base"]),
  decimals: z.number(),
  message: z.string().optional(),
});

export type CreatePendingTransferRequest = z.infer<typeof CreatePendingTransferSchema>;

export type PendingTransferSummary = {
  transferId: string;
  recipientEmail: string;
  senderName: string;
  senderEmail?: string;
  amount: string;
  token: string;
  chain: ChainType;
  status: string;
  createdAt: string;
  expiresAt: string;
  daysRemaining: number;
};

class PendingTransferService {
  private readonly EXPIRY_DAYS = 7;
  private readonly REMINDER_HOURS = 48; // Send reminder 48 hours before expiry
  private readonly useRemoteApi = isReactNative;
  private readonly extra = getExpoExtra();
  private readonly apiBaseUrl =
    (isReactNative ? this.extra.metasendApiBaseUrl : process.env.METASEND_API_BASE_URL) || "";
  private readonly apiKey =
    (isReactNative ? this.extra.metasendApiKey : process.env.METASEND_API_KEY) || "";

  private ensureApiConfig() {
    if (!this.apiBaseUrl || !this.apiKey) {
      throw new Error("MetaSend API configuration missing. Set METASEND_API_BASE_URL and METASEND_API_KEY.");
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    this.ensureApiConfig();

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Create a new pending transfer
   */
  async createPendingTransfer(request: CreatePendingTransferRequest): Promise<PendingTransfer> {
    if (this.useRemoteApi) {
      try {
        const result = await this.request<{ success: boolean; transfer?: PendingTransfer; status?: string }>(
          "/api/pending-transfers",
          {
            method: "POST",
            body: JSON.stringify(request),
          }
        );

        // If API returns 202 (processing), create a placeholder transfer
        if (result.status === "processing" && !result.transfer) {
          const transferId = `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const now = new Date();
          const expiresAt = new Date(now.getTime() + this.EXPIRY_DAYS * 24 * 60 * 60 * 1000);

          return {
            transferId,
            recipientEmail: request.recipientEmail.toLowerCase(),
            senderUserId: request.senderUserId,
            senderEmail: "", // Will be filled by backend
            senderName: "", // Will be filled by backend
            amount: request.amount,
            token: request.token,
            tokenAddress: request.tokenAddress,
            chain: request.chain,
            decimals: request.decimals,
            status: "pending",
            escrowTransferId: "", // Will be filled by backend
            escrowTxHash: "", // Will be filled by backend
            escrowStatus: "pending",
            recipientHash: "",
            transactionHash: "", // Will be filled by backend
            message: request.message,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          };
        }

        return result.transfer!;
      } catch (error) {
        // Error will be logged at UI layer
        throw error;
      }
    }

    console.log("⏱️ createPendingTransfer - Start");
    const startTime = Date.now();

    const validated = CreatePendingTransferSchema.parse(request);
    console.log(`⏱️ Schema parse: ${Date.now() - startTime}ms`);

    let senderProfile = null;
    try {
      senderProfile = await userDirectoryService.getUserProfile(validated.senderUserId);
    } catch (error) {
      console.warn("⚠️ Unable to fetch sender profile prior to pending transfer creation", error);
    }

    // Create pending transfer record FIRST (fastest path)
    const transferId = `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Create pooled escrow transfer
    const escrowStart = Date.now();
    const onchainReceipt = await escrowService.createOnchainTransfer({
      recipientEmail: validated.recipientEmail,
      amount: validated.amount,
      decimals: validated.decimals,
      tokenAddress: validated.tokenAddress,
      chain: validated.chain,
      expiry: Math.floor(expiresAt.getTime() / 1000),
    });
    console.log(`⏱️ Escrow transfer creation: ${Date.now() - escrowStart}ms`);

    const transfer: PendingTransfer = {
      transferId,
      recipientEmail: validated.recipientEmail.toLowerCase(),
      senderUserId: validated.senderUserId,
      senderEmail: senderProfile?.email || "",
      senderName: senderProfile?.displayName || senderProfile?.email || "",
      amount: validated.amount,
      token: validated.token,
      tokenAddress: validated.tokenAddress,
      chain: validated.chain,
      decimals: validated.decimals,
      status: "pending",
      escrowTransferId: onchainReceipt.transferId,
      escrowTxHash: onchainReceipt.txHash,
      escrowStatus: "pending",
      recipientHash: onchainReceipt.recipientHash,
      transactionHash: onchainReceipt.txHash,
      message: validated.message,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const dbStart = Date.now();
    await mongoDatabase.createPendingTransfer(transfer);
    console.log(`⏱️ DB insert: ${Date.now() - dbStart}ms`);
    console.log(`⏱️ Total createPendingTransfer: ${Date.now() - startTime}ms`);

    // Get sender details and send emails in background (fire-and-forget)
    (senderProfile ? Promise.resolve(senderProfile) : userDirectoryService.getUserProfile(validated.senderUserId))
      .then((sender) => {
        if (!sender) {
          console.warn("⚠️ Sender not found for background processing");
          return;
        }

        // Send invite email (fire-and-forget)
        return Promise.allSettled([
          emailNotificationService.sendInviteWithPendingTransfer(
            validated.recipientEmail,
            sender.displayName || sender.email,
            sender.email,
            validated.amount,
            validated.token,
            transferId
          ),
          emailNotificationService.sendTransferConfirmation(
            sender.email,
            sender.displayName || sender.email,
            validated.recipientEmail,
            validated.amount,
            validated.token,
            "pending"
          ),
        ]);
      })
      .then((results) => {
        if (results) {
          results.forEach((result, index) => {
            if (result.status === "fulfilled") {
              console.log(index === 0 ? "📨 Invite email sent" : "📨 Sender confirmation sent");
            } else {
              console.warn("⚠️ Email notification failed:", result.reason);
            }
          });
        }
      })
      .catch((error) => console.warn("⚠️ Background processing failed:", error));

    return transfer;
  }

  /**
   * Get pending transfers for a recipient email
   */
  async getPendingTransfers(recipientEmail: string): Promise<PendingTransferSummary[]> {
    if (this.useRemoteApi) {
      const result = await this.request<{ success: boolean; transfers?: PendingTransferSummary[] }>(
        `/api/pending-transfers?recipientEmail=${encodeURIComponent(recipientEmail)}`
      );
      return result.transfers ?? [];
    }

    const transfers = await mongoDatabase.getPendingTransfersByRecipientEmail(recipientEmail);

    return transfers.map((transfer) => ({
      transferId: transfer.transferId,
      recipientEmail: transfer.recipientEmail,
      senderName: transfer.senderName || transfer.senderEmail,
      senderEmail: transfer.senderEmail,
      amount: transfer.amount,
      token: transfer.token,
      chain: transfer.chain,
      status: transfer.status,
      createdAt: transfer.createdAt,
      expiresAt: transfer.expiresAt,
      daysRemaining: this.calculateDaysRemaining(transfer.expiresAt),
    }));
  }

  /**
   * Get pending transfers sent by a user
   */
  async getSentPendingTransfers(senderUserId: string): Promise<PendingTransferSummary[]> {
    if (this.useRemoteApi) {
      const result = await this.request<{ success: boolean; transfers?: PendingTransferSummary[] }>(
        `/api/pending-transfers?senderUserId=${encodeURIComponent(senderUserId)}`
      );
      return result.transfers ?? [];
    }

    const transfers = await mongoDatabase.getPendingTransfersBySender(senderUserId);

    return transfers
      .filter((t) => t.status === "pending")
      .map((transfer) => ({
        transferId: transfer.transferId,
        recipientEmail: transfer.recipientEmail,
        senderName: transfer.senderName || transfer.senderEmail,
        senderEmail: transfer.senderEmail,
        amount: transfer.amount,
        token: transfer.token,
        chain: transfer.chain,
        status: transfer.status,
        createdAt: transfer.createdAt,
        expiresAt: transfer.expiresAt,
        daysRemaining: this.calculateDaysRemaining(transfer.expiresAt),
      }));
  }

  /**
   * Claim a pending transfer
   */
  async claimPendingTransfer(transferId: string, claimantUserId: string): Promise<string> {
    if (this.useRemoteApi) {
      const result = await this.request<{ success: boolean; claimTransactionHash: string }>(
        "/api/pending-transfers",
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "claim",
            transferId,
            claimantUserId,
          }),
        }
      );
      return result.claimTransactionHash;
    }

    console.log(`[PendingTransferService] Attempting to claim transfer: ${transferId}`);
    const transfer = await mongoDatabase.getPendingTransferById(transferId);

    if (!transfer) {
      console.error(`[PendingTransferService] Transfer not found: ${transferId}`);
      throw new Error("Pending transfer not found");
    }

    console.log(`[PendingTransferService] Transfer status: ${transfer.status}`);
    if (transfer.status !== "pending") {
      console.error(`[PendingTransferService] Transfer already ${transfer.status}: ${transferId}`);
      throw new Error(`This transfer has already been ${transfer.status}`);
    }

    // Verify claimant email matches
    const claimant = await userDirectoryService.getUserProfile(claimantUserId);
    if (!claimant) {
      throw new Error("Claimant not found");
    }

    if (claimant.email.toLowerCase() !== transfer.recipientEmail.toLowerCase()) {
      throw new Error("Email mismatch. You can only claim transfers sent to your email.");
    }

    // Check if expired
    if (new Date(transfer.expiresAt) < new Date()) {
      throw new Error("This transfer has expired");
    }

    // Get recipient wallet for the chain
    const recipientWallet = await userDirectoryService.getWalletForChain(claimantUserId, transfer.chain);
    if (!recipientWallet) {
      throw new Error(`You don't have a ${transfer.chain} wallet configured`);
    }

    const escrowTransferId = transfer.escrowTransferId;
    if (!escrowTransferId) {
      throw new Error("Transfer is not yet registered on shared escrow. Please contact support.");
    }

    console.log(`[PendingTransferService] Claiming shared escrow transfer ${escrowTransferId}`);
    let claimTxHash: string;
    try {
      const receipt = await escrowService.claimOnchainTransfer(
        escrowTransferId,
        recipientWallet,
        transfer.recipientEmail
      );
      claimTxHash = receipt.txHash;
      console.log(`[PendingTransferService] Claim UserOp sent, hash: ${claimTxHash}`);
    } catch (error) {
      console.error(`[PendingTransferService] Shared escrow claim failed:`, error);
      throw new Error(`Failed to submit claim: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Update transfer status only after successful blockchain transaction
    console.log(`[PendingTransferService] Updating transfer status to claimed`);
    await mongoDatabase.updatePendingTransfer(transferId, {
      status: "claimed",
      claimedAt: new Date().toISOString(),
      claimedByUserId: claimantUserId,
      claimTransactionHash: claimTxHash,
      escrowStatus: "claimed",
      escrowTxHash: claimTxHash,
      recipientWallet,
    });

    // Notify sender
    const sender = await userDirectoryService.getUserProfile(transfer.senderUserId);
    if (sender) {
      await emailNotificationService.sendPendingTransferClaimed(
        sender.email,
        sender.displayName || sender.email,
        transfer.recipientEmail,
        transfer.amount,
        transfer.token
      );
    }

    return claimTxHash;
  }

  /**
   * Sync a single transfer's status with blockchain
   */
  async syncTransferStatus(transferId: string): Promise<void> {
    if (this.useRemoteApi) {
      // Remote API will handle sync
      return;
    }

    const transfer = await mongoDatabase.getPendingTransferById(transferId);
    if (!transfer || !transfer.escrowTransferId) {
      console.warn(`Cannot sync transfer ${transferId}: missing escrow ID`);
      return;
    }

    try {
      // Get actual blockchain status
      const blockchainStatus = await escrowService.getTransferStatus(transfer.escrowTransferId);

      if (!blockchainStatus) {
        console.warn(`Cannot determine blockchain status for transfer ${transferId}`);
        return;
      }

      // Update database if status differs
      if (transfer.status !== blockchainStatus) {
        console.log(`Syncing transfer ${transferId}: ${transfer.status} → ${blockchainStatus}`);
        // Map blockchain status to database status
        const dbStatus = blockchainStatus === 'cancelled' ? 'refunded' : blockchainStatus;
        await mongoDatabase.updatePendingTransfer(transferId, {
          status: dbStatus as any,
          escrowStatus: dbStatus as any,
        });
      }
    } catch (error) {
      console.error(`Failed to sync transfer ${transferId}:`, error);
    }
  }

  /**
   * Sync all pending transfers for a user with blockchain
   */
  async syncAllPendingTransfers(senderUserId: string): Promise<number> {
    if (this.useRemoteApi) {
      // Remote API will handle sync
      return 0;
    }

    const transfers = await mongoDatabase.getPendingTransfersBySender(senderUserId);
    const pendingTransfers = transfers.filter(t => t.status === 'pending');

    let syncedCount = 0;
    for (const transfer of pendingTransfers) {
      try {
        await this.syncTransferStatus(transfer.transferId);
        syncedCount++;
      } catch (error) {
        console.error(`Failed to sync transfer ${transfer.transferId}:`, error);
      }
    }

    return syncedCount;
  }

  /**
   * Cancel a pending transfer (sender only)
   */
  async cancelPendingTransfer(transferId: string, senderUserId: string): Promise<string> {
    if (this.useRemoteApi) {
      const result = await this.request<{ success: boolean; refundTransactionHash: string }>(
        "/api/pending-transfers",
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "cancel",
            transferId,
            senderUserId,
          }),
        }
      );
      return result.refundTransactionHash;
    }

    // Sync status with blockchain first
    await this.syncTransferStatus(transferId);

    // Re-fetch transfer to get updated status
    const transfer = await mongoDatabase.getPendingTransferById(transferId);

    if (!transfer) {
      throw new Error("Pending transfer not found");
    }

    if (transfer.senderUserId !== senderUserId) {
      throw new Error("Only the sender can cancel this transfer");
    }

    if (transfer.status !== "pending") {
      throw new Error(`Cannot cancel: transfer is already ${transfer.status}`);
    }

    // Get sender wallet
    const senderWallet = await userDirectoryService.getWalletForChain(senderUserId, transfer.chain);
    if (!senderWallet) {
      throw new Error("Sender wallet not found");
    }

    const escrowTransferId = transfer.escrowTransferId;
    if (!escrowTransferId) {
      throw new Error("Transfer is not yet registered on shared escrow. Please contact support.");
    }

    // Verify on blockchain that it's cancellable
    const isCancellable = await escrowService.isTransferCancellable(escrowTransferId);
    if (!isCancellable) {
      // Sync again to update status
      await this.syncTransferStatus(transferId);
      const updated = await mongoDatabase.getPendingTransferById(transferId);
      throw new Error(`Transfer cannot be cancelled - it has been ${updated?.status || 'claimed'}. The status has been updated.`);
    }

    const refundReceipt = await escrowService.refundOnchainTransfer(escrowTransferId, senderWallet);
    const returnTxHash = refundReceipt.txHash;

    // Update transfer status
    await mongoDatabase.updatePendingTransfer(transferId, {
      status: "cancelled",
      claimTransactionHash: returnTxHash,
      escrowStatus: "refunded",
      escrowTxHash: returnTxHash,
    });

    return returnTxHash;
  }

  /**
   * Process expired transfers (run as cron job)
   */
  async expirePendingTransfers(): Promise<number> {
    const expiredTransfers = await mongoDatabase.getExpiredPendingTransfers();
    let count = 0;

    for (const transfer of expiredTransfers) {
      try {
        // Get sender wallet
        const senderWallet = await userDirectoryService.getWalletForChain(transfer.senderUserId, transfer.chain);
        if (!senderWallet) {
          console.error(`Sender wallet not found for transfer ${transfer.transferId}`);
          continue;
        }

        if (!transfer.escrowTransferId) {
          console.error(`Transfer ${transfer.transferId} missing escrowTransferId for expiry processing`);
          continue;
        }

        const refundReceipt = await escrowService.refundOnchainTransfer(
          transfer.escrowTransferId,
          senderWallet
        );
        const returnTxHash = refundReceipt.txHash;

        // Update transfer status
        await mongoDatabase.updatePendingTransfer(transfer.transferId, {
          status: "expired",
          claimTransactionHash: returnTxHash,
          escrowStatus: "expired",
          escrowTxHash: returnTxHash,
        });

        // Notify sender
        const sender = await userDirectoryService.getUserProfile(transfer.senderUserId);
        if (sender) {
          await emailNotificationService.sendPendingTransferExpired(
            sender.email,
            sender.displayName || sender.email,
            transfer.recipientEmail,
            transfer.amount,
            transfer.token
          );
        }

        count++;
      } catch (error) {
        console.error(`Failed to expire transfer ${transfer.transferId}:`, error);
      }
    }

    return count;
  }

  /**
   * Send reminders for expiring transfers (run as cron job)
   */
  async sendExpiryReminders(): Promise<number> {
    const expiringTransfers = await mongoDatabase.getExpiringPendingTransfers(this.REMINDER_HOURS);
    let count = 0;

    for (const transfer of expiringTransfers) {
      try {
        const hoursLeft = Math.ceil(
          (new Date(transfer.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)
        );

        await emailNotificationService.sendPendingTransferExpiring(
          transfer.recipientEmail,
          transfer.senderName || transfer.senderEmail,
          transfer.amount,
          transfer.token,
          hoursLeft,
          transfer.transferId
        );

        count++;
      } catch (error) {
        console.error(`Failed to send reminder for transfer ${transfer.transferId}:`, error);
      }
    }

    return count;
  }

  /**
   * Auto-claim pending transfers when a user signs up
   */
  async autoClaimForNewUser(userId: string, email: string): Promise<number> {
    if (this.useRemoteApi) {
      const result = await this.request<{ success: boolean; claimedCount: number }>(
        "/api/pending-transfers",
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "auto-claim",
            userId,
            email,
          }),
        }
      );
      return result.claimedCount;
    }

    const pendingTransfers = await mongoDatabase.getPendingTransfersByRecipientEmail(email);
    let claimedCount = 0;

    for (const transfer of pendingTransfers) {
      if (transfer.status === "pending") {
        try {
          await this.claimPendingTransfer(transfer.transferId, userId);
          claimedCount++;
        } catch (error) {
          console.error(`Failed to auto-claim transfer ${transfer.transferId}:`, error);
        }
      }
    }

    return claimedCount;
  }

  /**
   * Get transfer details
   */
  async getTransferDetails(transferId: string): Promise<PendingTransfer | null> {
    if (this.useRemoteApi) {
      const result = await this.request<{ success: boolean; transfer?: PendingTransfer }>(
        `/api/pending-transfers?transferId=${encodeURIComponent(transferId)}`
      );
      return result.transfer ?? null;
    }

    return mongoDatabase.getPendingTransferById(transferId);
  }

  private calculateDaysRemaining(expiresAt: string): number {
    const now = Date.now();
    const expires = new Date(expiresAt).getTime();
    const diff = expires - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
}

// Export singleton instance
export const pendingTransferService = new PendingTransferService();
