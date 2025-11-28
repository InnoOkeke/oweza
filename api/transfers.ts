import { Request, Response, Router } from "express";
import { z } from "zod";
import mongoDatabase from "../src/services/mongoDatabase";
import type { TransferRecord } from "../src/types/transfers";

const router = Router();
const authorize = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.METASEND_API_KEY}`;
};

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ success: false, error: message });

const TransferIntentSchema = z.object({
  recipientEmail: z.string().email(),
  amountUsdc: z.number().nonnegative(),
  memo: z.string().optional(),
  senderEmail: z.string().email().optional(),
  senderName: z.string().optional(),
  senderUserId: z.string().optional(),
});

const TransferRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  senderWallet: z.string(),
  intent: TransferIntentSchema,
  status: z.enum(["sent", "pending_recipient_signup"]),
  txHash: z.string().optional(),
  redemptionCode: z.string().optional(),
  recipientWallet: z.string().optional(),
  pendingTransferId: z.string().optional(),
});

type ListFilter = {
  senderWallet?: string;
  recipientWallet?: string;
  senderUserId?: string;
  limit?: number;
};

router.get('/', async (req: Request, res: Response) => {
  if (!authorize(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const db = mongoDatabase;
    const filter: ListFilter = {};
    if (typeof req.query.senderWallet === "string") {
      filter.senderWallet = req.query.senderWallet;
    }
    if (typeof req.query.recipientWallet === "string") {
      filter.recipientWallet = req.query.recipientWallet;
    }
    if (typeof req.query.senderUserId === "string") {
      filter.senderUserId = req.query.senderUserId;
    }
    if (typeof req.query.limit === "string") {
      const parsedLimit = Number(req.query.limit);
      if (!Number.isNaN(parsedLimit)) {
        filter.limit = parsedLimit;
      }
    }
    if (!filter.senderWallet && !filter.recipientWallet && !filter.senderUserId) {
      return badRequest(res, "Provide senderWallet, recipientWallet, or senderUserId");
    }
    const transfers = await db.listTransferRecords(filter);
    return res.status(200).json({ success: true, transfers });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post('/', async (req: Request, res: Response) => {
  if (!authorize(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const db = mongoDatabase;
    const parsed = TransferRecordSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.message);
    await db.saveTransferRecord(parsed.data as TransferRecord);
    return res.status(201).json({ success: true, transfer: parsed.data });
  } catch (err) {
    console.error('Transfers POST error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
