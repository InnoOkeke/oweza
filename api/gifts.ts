/**
 * Crypto Gifts API
 * Handles creating, claiming, and managing crypto gifts
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import mongoDb from "../src/services/mongoDatabase";
import { userDirectoryService } from "../src/services/UserDirectoryService";
import { pendingTransferService } from "../src/services/PendingTransferService";
import { CryptoGift, GiftStatus, GiftTheme } from "../src/types/database";
import { USDC_TOKEN_ADDRESS, USDC_DECIMALS } from "../src/config/coinbase.server";
import { generateGiftCode } from "../src/utils/giftCode";

const CreateGiftSchema = z.object({
  senderUserId: z.string(),
  senderEmail: z.string().email(),
  senderName: z.string().optional(),
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  amount: z.string(),
  token: z.string(),
  chain: z.enum(["base"]),
  theme: z.enum(["birthday", "anniversary", "holiday", "thank_you", "congratulations", "red_envelope", "custom"]),
  message: z.string().optional(),
  expiresInDays: z.number().optional(),
  transactionHash: z.string().optional(), // For registered users (direct send)
});

const ClaimGiftSchema = z.object({
  giftId: z.string(),
  recipientUserId: z.string(),
  claimTransactionHash: z.string(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // GET - Retrieve gifts
    if (req.method === "GET") {
      const { giftId, senderUserId, recipientEmail } = req.query;

      if (giftId) {
        const gift = await mongoDb.getGiftById(giftId as string);
        if (!gift) {
          return res.status(404).json({ error: "Gift not found" });
        }
        return res.status(200).json(gift);
      }

      if (senderUserId) {
        const gifts = await mongoDb.getGiftsBySender(senderUserId as string);
        return res.status(200).json(gifts);
      }

      if (recipientEmail) {
        const gifts = await mongoDb.getGiftsByRecipient(recipientEmail as string);
        return res.status(200).json(gifts);
      }

      return res.status(400).json({ error: "Missing query parameters" });
    }

    // POST - Create gift
    if (req.method === "POST") {
      const validation = CreateGiftSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const data = validation.data;
      const giftId = `gift_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const now = new Date().toISOString();

      const expiresAt = data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      // Generate gift code
      const giftCode = generateGiftCode(data.theme);

      // Check if recipient is registered
      const recipientUser = await userDirectoryService.findUserByEmail(data.recipientEmail.toLowerCase().trim());

      let gift: CryptoGift;

      if (!recipientUser) {
        // Recipient not registered - create pending transfer
        const transfer = await pendingTransferService.createPendingTransfer({
          recipientEmail: data.recipientEmail.toLowerCase().trim(),
          senderUserId: data.senderUserId,
          amount: data.amount,
          token: data.token,
          tokenAddress: USDC_TOKEN_ADDRESS,
          chain: data.chain,
          decimals: USDC_DECIMALS,
          message: data.message,
        });

        gift = {
          giftId,
          senderUserId: data.senderUserId,
          senderEmail: data.senderEmail.toLowerCase().trim(),
          senderName: data.senderName,
          recipientEmail: data.recipientEmail.toLowerCase().trim(),
          recipientName: data.recipientName,
          amount: data.amount,
          token: data.token,
          chain: data.chain,
          theme: data.theme,
          message: data.message,
          giftCode,
          pendingTransferId: transfer.transferId,
          status: "pending" as GiftStatus,
          createdAt: now,
          expiresAt,
        };
      } else {
        // Recipient is registered - mark as sent directly
        gift = {
          giftId,
          senderUserId: data.senderUserId,
          senderEmail: data.senderEmail.toLowerCase().trim(),
          senderName: data.senderName,
          recipientEmail: data.recipientEmail.toLowerCase().trim(),
          recipientUserId: recipientUser.userId,
          recipientName: data.recipientName || recipientUser.displayName,
          amount: data.amount,
          token: data.token,
          chain: data.chain,
          theme: data.theme,
          message: data.message,
          giftCode,
          status: "claimed" as GiftStatus, // Auto-claimed for registered users
          transactionHash: data.transactionHash,
          createdAt: now,
          expiresAt,
          claimedAt: now,
        };
      }

      await mongoDb.createGift(gift);
      return res.status(201).json(gift);
    }

    // PATCH - Update gift (claim, cancel, etc.)
    if (req.method === "PATCH") {
      const { giftId, action } = req.query;

      if (!giftId || !action) {
        return res.status(400).json({ error: "Missing giftId or action" });
      }

      const gift = await mongoDb.getGiftById(giftId as string);
      if (!gift) {
        return res.status(404).json({ error: "Gift not found" });
      }

      const now = new Date().toISOString();

      // Claim action
      if (action === "claim") {
        const validation = ClaimGiftSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({ error: validation.error.errors });
        }

        if (gift.status !== "pending") {
          return res.status(400).json({ error: "Gift is not pending" });
        }

        const data = validation.data;
        const updated = await mongoDb.updateGift(giftId as string, {
          status: "claimed" as GiftStatus,
          recipientUserId: data.recipientUserId,
          claimTransactionHash: data.claimTransactionHash,
          claimedAt: now,
        });
        return res.status(200).json(updated);
      }

      // Cancel action
      if (action === "cancel") {
        if (gift.status !== "pending") {
          return res.status(400).json({ error: "Only pending gifts can be cancelled" });
        }

        // If gift has a pending transfer, cancel it to trigger refund
        if (gift.pendingTransferId) {
          try {
            await pendingTransferService.cancelPendingTransfer(gift.pendingTransferId, gift.senderUserId);
          } catch (error) {
            console.error("Error cancelling pending transfer:", error);
            // Continue with gift cancellation even if transfer cancellation fails
          }
        }

        const updated = await mongoDb.updateGift(giftId as string, {
          status: "cancelled" as GiftStatus,
        });

        return res.status(200).json({
          updated,
          message: gift.pendingTransferId
            ? "Gift cancelled. Funds will be refunded automatically."
            : "Gift cancelled."
        });
      }

      // Mark as expired (for background jobs)
      if (action === "expire") {
        if (gift.status !== "pending") {
          return res.status(400).json({ error: "Only pending gifts can expire" });
        }

        const updated = await mongoDb.updateGift(giftId as string, {
          status: "expired" as GiftStatus,
        });
        return res.status(200).json(updated);
      }

      return res.status(400).json({ error: "Invalid action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Gifts API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
