/**
 * Unified Send Service
 * Main orchestration service for all types of sends (email, address, eTag)
 */

import { z } from "zod";
import { userDirectoryService } from "./UserDirectoryService";
import { pendingTransferService } from "./PendingTransferService";
import { emailNotificationService } from "./EmailNotificationService";
import { ChainType } from "../types/database";

export const SendToEmailSchema = z.object({
  recipientEmail: z.string().email(),
  amount: z.string(),
  token: z.string(),
  tokenAddress: z.string(),
  chain: z.enum(["celo"]),
  decimals: z.number(),
  senderUserId: z.string(),
  message: z.string().optional(),
});

export const SendToAddressSchema = z.object({
  recipientAddress: z.string(),
  amount: z.string(),
  token: z.string(),
  tokenAddress: z.string(),
  chain: z.enum(["celo"]),
  decimals: z.number(),
  senderUserId: z.string(),
  message: z.string().optional(),
});

export type SendToEmailRequest = z.infer<typeof SendToEmailSchema>;
export type SendToAddressRequest = z.infer<typeof SendToAddressSchema>;

export type RecipientResolution = {
  type: "email" | "address" | "unknown";
  isRegistered: boolean;
  recipientUserId?: string;
  recipientEmail?: string;
  recipientName?: string;
  recipientAddress?: string;
  walletAddress?: string;
  hasWalletForChain?: boolean;
};

export type SendResult = {
  success: boolean;
  transferType: "direct" | "pending";
  transactionHash?: string;
  pendingTransferId?: string;
  recipientEmail?: string;
  message: string;
};

class UnifiedSendService {
  /**
   * Resolve recipient input (email, address, or eTag)
   */
  async resolveRecipient(input: string, chain?: ChainType): Promise<RecipientResolution> {
    const trimmed = input.trim().toLowerCase();

    // Check if it's an email
    if (this.isEmail(trimmed)) {
      const user = await userDirectoryService.findUserByEmail(trimmed);

      if (user) {
        const hasWallet = chain ? Boolean(user.wallets[chain]) : false;
        return {
          type: "email",
          isRegistered: true,
          recipientUserId: user.userId,
          recipientEmail: user.email,
          recipientName: user.displayName,
          walletAddress: chain ? user.wallets[chain] : undefined,
          hasWalletForChain: hasWallet,
        };
      }

      return {
        type: "email",
        isRegistered: false,
        recipientEmail: trimmed,
      };
    }

    // Check if it's a blockchain address
    if (this.isBlockchainAddress(trimmed)) {
      return {
        type: "address",
        isRegistered: false,
        recipientAddress: trimmed,
      };
    }

    // TODO: Add support for eTag resolution (e.g., @username)
    // if (trimmed.startsWith('@')) {
    //   return this.resolveETag(trimmed);
    // }

    return {
      type: "unknown",
      isRegistered: false,
    };
  }

  /**
   * Send to email address
   */
  async sendToEmail(request: SendToEmailRequest): Promise<SendResult> {
    const validated = SendToEmailSchema.parse(request);

    // Get sender details
    const sender = await userDirectoryService.getUserProfile(validated.senderUserId);
    if (!sender) {
      throw new Error("Sender not found");
    }

    // Verify sender has wallet for this chain
    const senderWallet = sender.wallets[validated.chain];
    if (!senderWallet) {
      throw new Error(`You don't have a ${validated.chain} wallet configured`);
    }

    // Resolve recipient
    const recipient = await this.resolveRecipient(validated.recipientEmail, validated.chain);

    if (!recipient.isRegistered) {
      // Create pending transfer
      const transfer = await pendingTransferService.createPendingTransfer({
        recipientEmail: validated.recipientEmail,
        senderUserId: validated.senderUserId,
        amount: validated.amount,
        token: validated.token,
        tokenAddress: validated.tokenAddress,
        chain: validated.chain,
        decimals: validated.decimals,
        message: validated.message,
      });

      return {
        success: true,
        transferType: "pending",
        pendingTransferId: transfer.transferId,
        recipientEmail: validated.recipientEmail,
        message: `Invite sent to ${validated.recipientEmail}. They have 7 days to claim the funds.`,
      };
    }

    // Recipient is registered - send directly
    if (!recipient.walletAddress) {
      throw new Error(`Recipient doesn't have a ${validated.chain} wallet configured`);
    }

    // Execute direct transfer (in production, use actual blockchain transaction)
    const txHash = await this.executeDirectTransfer({
      fromAddress: senderWallet,
      toAddress: recipient.walletAddress,
      amount: validated.amount,
      tokenAddress: validated.tokenAddress,
      chain: validated.chain,
    });

    // Send notifications
    await emailNotificationService.sendTransferNotification(
      validated.recipientEmail,
      recipient.recipientName || validated.recipientEmail,
      sender.displayName || sender.email,
      validated.amount,
      validated.token,
      validated.chain
    );

    await emailNotificationService.sendTransferConfirmation(
      sender.email,
      sender.displayName || sender.email,
      validated.recipientEmail,
      validated.amount,
      validated.token,
      "sent"
    );

    return {
      success: true,
      transferType: "direct",
      transactionHash: txHash,
      recipientEmail: validated.recipientEmail,
      message: `Successfully sent ${validated.amount} ${validated.token} to ${validated.recipientEmail}`,
    };
  }

  /**
   * Send to blockchain address
   */
  async sendToAddress(request: SendToAddressRequest): Promise<SendResult> {
    const validated = SendToAddressSchema.parse(request);

    // Get sender details
    const sender = await userDirectoryService.getUserProfile(validated.senderUserId);
    if (!sender) {
      throw new Error("Sender not found");
    }

    // Verify sender has wallet for this chain
    const senderWallet = sender.wallets[validated.chain];
    if (!senderWallet) {
      throw new Error(`You don't have a ${validated.chain} wallet configured`);
    }

    // Execute direct transfer
    const txHash = await this.executeDirectTransfer({
      fromAddress: senderWallet,
      toAddress: validated.recipientAddress,
      amount: validated.amount,
      tokenAddress: validated.tokenAddress,
      chain: validated.chain,
    });

    return {
      success: true,
      transferType: "direct",
      transactionHash: txHash,
      message: `Successfully sent ${validated.amount} ${validated.token} to ${validated.recipientAddress}`,
    };
  }

  /**
   * Validate recipient input
   */
  async validateRecipient(input: string, chain?: ChainType): Promise<{
    isValid: boolean;
    error?: string;
    resolution?: RecipientResolution;
  }> {
    if (!input || input.trim().length === 0) {
      return { isValid: false, error: "Recipient cannot be empty" };
    }

    const resolution = await this.resolveRecipient(input, chain);

    if (resolution.type === "unknown") {
      return {
        isValid: false,
        error: "Invalid recipient. Please enter an email address or blockchain address.",
      };
    }

    if (resolution.type === "email" && resolution.isRegistered && chain) {
      if (!resolution.hasWalletForChain) {
        return {
          isValid: false,
          error: `Recipient doesn't have a ${chain} wallet configured.`,
          resolution,
        };
      }
    }

    return {
      isValid: true,
      resolution,
    };
  }

  /**
   * Get send preview/estimation
   */
  async getSendPreview(input: string, amount: string, token: string, chain: ChainType) {
    const resolution = await this.resolveRecipient(input, chain);

    return {
      recipient: resolution,
      amount,
      token,
      chain,
      willCreatePending: resolution.type === "email" && !resolution.isRegistered,
      estimatedDelivery: resolution.isRegistered ? "Instant" : "When recipient signs up (up to 7 days)",
      gasFees: "Gasless (paid in cUSD)",
    };
  }

  /**
   * Execute direct blockchain transfer
   */
  private async executeDirectTransfer(params: {
    fromAddress: string;
    toAddress: string;
    amount: string;
    tokenAddress: string;
    chain: ChainType;
  }): Promise<string> {
    // TODO: Integrate with actual blockchain transaction execution
    // - For EVM: Use ethers.js or viem
    // - For Solana: Use @solana/web3.js
    // - For Tron: Use TronWeb

    // Simulate transaction
    await this.delay(1000);

    console.log("Executing transfer:", params);

    const txHash = `0x${Math.random().toString(36).substring(2).padEnd(64, "0")}`;
    return txHash;
  }

  private isEmail(input: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(input);
  }

  private isBlockchainAddress(input: string): boolean {
    // EVM address (Celo)
    if (/^0x[a-fA-F0-9]{40}$/.test(input)) return true;

    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const unifiedSendService = new UnifiedSendService();
