/**
 * Crypto Gift Service
 * Handle themed crypto gifts and red envelopes
 */

import { z } from "zod";
import { CryptoGift, GiftTheme, GiftStatus, ChainType } from "../types/database";
import { emailNotificationService } from "./EmailNotificationService";

declare const require: any;

const getApiBaseUrl = () => {
  try {
    const Constants = require("expo-constants").default;
    return Constants?.expoConfig?.extra?.metasendApiBaseUrl || process.env.METASEND_API_BASE_URL || "https://metasend-api.onrender.com";
  } catch (_error) {
    return process.env.METASEND_API_BASE_URL || "https://metasend-api.onrender.com";
  }
};

export const CreateGiftSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  amount: z.string(),
  token: z.string(),
  chain: z.enum(["base"]),
  theme: z.enum(["birthday", "anniversary", "holiday", "thank_you", "congratulations", "red_envelope", "custom"]),
  message: z.string().max(500).optional(),
  expiresInDays: z.number().optional().default(30),
});

export type CreateGiftInput = z.infer<typeof CreateGiftSchema>;

export type GiftSummary = {
  giftId: string;
  senderEmail: string;
  senderName?: string;
  recipientEmail: string;
  recipientName?: string;
  amount: string;
  token: string;
  theme: GiftTheme;
  status: GiftStatus;
  createdAt: string;
  claimedAt?: string;
  expiresAt?: string;
  escrowTransferId?: string;
  recipientHash?: string;
  escrowStatus?: "pending" | "claimed" | "refunded" | "expired";
  escrowTxHash?: string;
};

export type GiftThemeConfig = {
  theme: GiftTheme;
  emoji: string;
  name: string;
  description: string;
  backgroundColor: string;
  primaryColor: string;
};

class CryptoGiftService {
  private readonly apiBaseUrl = getApiBaseUrl();
  private readonly GIFT_THEMES: Record<GiftTheme, GiftThemeConfig> = {
    birthday: {
      theme: "birthday",
      emoji: "🎂",
      name: "Birthday",
      description: "Happy Birthday!",
      backgroundColor: "#FEF3C7",
      primaryColor: "#F59E0B",
    },
    anniversary: {
      theme: "anniversary",
      emoji: "💝",
      name: "Anniversary",
      description: "Happy Anniversary!",
      backgroundColor: "#FCE7F3",
      primaryColor: "#EC4899",
    },
    holiday: {
      theme: "holiday",
      emoji: "🎄",
      name: "Holiday",
      description: "Happy Holidays!",
      backgroundColor: "#D1FAE5",
      primaryColor: "#10B981",
    },
    thank_you: {
      theme: "thank_you",
      emoji: "🙏",
      name: "Thank You",
      description: "Thank you!",
      backgroundColor: "#E0E7FF",
      primaryColor: "#6366F1",
    },
    congratulations: {
      theme: "congratulations",
      emoji: "🎉",
      name: "Congratulations",
      description: "Congratulations!",
      backgroundColor: "#DBEAFE",
      primaryColor: "#3B82F6",
    },
    red_envelope: {
      theme: "red_envelope",
      emoji: "🧧",
      name: "Red Envelope",
      description: "Good fortune!",
      backgroundColor: "#FEE2E2",
      primaryColor: "#DC2626",
    },
    custom: {
      theme: "custom",
      emoji: "🎁",
      name: "Custom Gift",
      description: "A special gift",
      backgroundColor: "#F3E8FF",
      primaryColor: "#A855F7",
    },
  };

  /**
   * Create a new crypto gift
   */
  async createGift(
    senderUserId: string,
    senderEmail: string,
    senderName: string | undefined,
    input: CreateGiftInput
  ): Promise<CryptoGift> {
    const validated = CreateGiftSchema.parse(input);

    const now = new Date();
    const expiresAt = validated.expiresInDays
      ? new Date(now.getTime() + validated.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const response = await fetch(`${this.apiBaseUrl}/api/gifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderUserId,
        senderEmail,
        senderName,
        recipientEmail: validated.recipientEmail.toLowerCase().trim(),
        recipientName: validated.recipientName,
        amount: validated.amount,
        token: validated.token,
        chain: validated.chain,
        theme: validated.theme,
        message: validated.message,
        expiresInDays: validated.expiresInDays,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to create crypto gift");
    }

    const gift: CryptoGift = await response.json();

    await this.sendGiftEmail(gift, senderName || senderEmail);

    return gift;
  }

  /**
   * Get gift by ID
   */
  async getGift(giftId: string): Promise<CryptoGift | null> {
    const response = await fetch(`${this.apiBaseUrl}/api/gifts?giftId=${giftId}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  }

  /**
   * Get gifts sent by user
   */
  async getSentGifts(userId: string): Promise<GiftSummary[]> {
    const response = await fetch(`${this.apiBaseUrl}/api/gifts?senderUserId=${userId}`);
    if (!response.ok) {
      return [];
    }
    return await response.json();
  }

  /**
   * Get gifts received by email
   */
  async getReceivedGifts(email: string): Promise<GiftSummary[]> {
    const response = await fetch(`${this.apiBaseUrl}/api/gifts?recipientEmail=${encodeURIComponent(email)}`);
    if (!response.ok) {
      return [];
    }
    return await response.json();
  }

  /**
   * Claim a gift
   */
  async claimGift(
    giftId: string,
    claimantUserId: string,
    claimantEmail: string,
    claimTransactionHash: string
  ): Promise<string> {
    const response = await fetch(`${this.apiBaseUrl}/api/gifts?giftId=${giftId}&action=claim`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        giftId,
        recipientUserId: claimantUserId,
        claimTransactionHash,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to claim gift");
    }

    const updated: CryptoGift = await response.json();
    return updated.claimTransactionHash || claimTransactionHash;
  }

  /**
   * Cancel a gift (sender only, if unclaimed)
   */
  async cancelGift(giftId: string, userId: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/api/gifts?giftId=${giftId}&action=cancel`, {
      method: "PATCH",
    });

    if (!response.ok) {
      throw new Error("Failed to cancel gift");
    }
  }

  /**
   * Process expired gifts
   */
  async processExpiredGifts(): Promise<number> {
    // TODO: Query database for expired unclaimed gifts
    // TODO: Return funds from escrow to sender
    // TODO: Update gift status
    // TODO: Send expiration notifications
    console.log("⏰ Processing expired gifts...");
    return 0;
  }

  /**
   * Send gift email notification
   */
  private async sendGiftEmail(gift: CryptoGift, senderName: string): Promise<void> {
    try {
      await emailNotificationService.sendGiftNotification(
        gift.recipientEmail,
        senderName,
        gift.amount,
        gift.token,
        gift.theme,
        gift.message,
        gift.giftId,
      );
    } catch (error) {
      console.warn("⚠️ Failed to send gift notification", error);
    }
  }

  /**
   * Get gift theme configuration
   */
  getGiftTheme(theme: GiftTheme): GiftThemeConfig {
    return this.GIFT_THEMES[theme];
  }

  /**
   * Get all available themes
   */
  getAllThemes(): GiftThemeConfig[] {
    return Object.values(this.GIFT_THEMES);
  }

  /**
   * Generate shareable gift link
   */
  generateGiftLink(giftId: string): string {
    return `https://metasend.vercel.app/gift/${giftId}`;
  }
}

export const cryptoGiftService = new CryptoGiftService();
