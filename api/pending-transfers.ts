import { Request, Response, Router } from "express";
import { pendingTransferService, CreatePendingTransferSchema } from "../src/services/PendingTransferService";

const router = Router();
const authorize = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.METASEND_API_KEY}`;
};

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ success: false, error: message });

router.get('/', async (req: Request, res: Response) => {
  if (!authorize(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const { recipientEmail, senderUserId, transferId } = req.query;
    if (recipientEmail && typeof recipientEmail === "string") {
      const transfers = await pendingTransferService.getPendingTransfers(recipientEmail);
      return res.status(200).json({ success: true, transfers });
    }
    if (senderUserId && typeof senderUserId === "string") {
      const transfers = await pendingTransferService.getSentPendingTransfers(senderUserId);
      return res.status(200).json({ success: true, transfers });
    }
    if (transferId && typeof transferId === "string") {
      const transfer = await pendingTransferService.getTransferDetails(transferId);
      return res.status(200).json({ success: true, transfer });
    }
    return badRequest(res, "Provide recipientEmail, senderUserId, or transferId");
  } catch (err) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post('/', async (req: Request, res: Response) => {
  if (!authorize(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const parsed = CreatePendingTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.message);
    }
    // Start processing asynchronously but don't wait for completion
    const transferPromise = pendingTransferService.createPendingTransfer(parsed.data);
    // Return immediately with pending status
    res.status(202).json({ success: true, status: "processing", message: "Transfer is being processed" });
    // Continue processing in background (fire-and-forget)
    transferPromise.catch(error => {
      console.error("Error processing pending transfer:", error);
    });
    return;
  } catch (err) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch('/', async (req: Request, res: Response) => {
  if (!authorize(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const { action } = req.body as { action?: string };
    if (!action) {
      return badRequest(res, "Action is required");
    }

    if (action === "claim") {
      const { transferId, claimantUserId } = req.body as { transferId?: string; claimantUserId?: string };
      if (!transferId || !claimantUserId) {
        return badRequest(res, "transferId and claimantUserId are required");
      }
      const claimTransactionHash = await pendingTransferService.claimPendingTransfer(transferId, claimantUserId);
      return res.status(200).json({ success: true, claimTransactionHash });
    }

    if (action === "cancel") {
      const { transferId, senderUserId } = req.body as { transferId?: string; senderUserId?: string };
      if (!transferId || !senderUserId) {
        return badRequest(res, "transferId and senderUserId are required");
      }
      const refundTransactionHash = await pendingTransferService.cancelPendingTransfer(transferId, senderUserId);
      return res.status(200).json({ success: true, refundTransactionHash });
    }

    if (action === "auto-claim") {
      const { userId, email } = req.body as { userId?: string; email?: string };
      if (!userId || !email) {
        return badRequest(res, "userId and email are required");
      }
      const claimedCount = await pendingTransferService.autoClaimForNewUser(userId, email);
      return res.status(200).json({ success: true, claimedCount });
    }

    return badRequest(res, `Unknown action: ${action}`);
  } catch (error) {
    console.error("❌ Pending transfers API error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
