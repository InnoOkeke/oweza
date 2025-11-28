/**
 * Invoices API
 * Handles creating, retrieving, and managing invoices
 */

import { Request, Response, Router } from "express";
import { z } from "zod";
import mongoDb from "../src/services/mongoDatabase";
import { Invoice, InvoiceStatus, InvoiceItem } from "../src/types/database";

const InvoiceItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.string(),
  amount: z.string(),
});

const CreateInvoiceSchema = z.object({
  creatorUserId: z.string(),
  creatorEmail: z.string().email(),
  creatorName: z.string().optional(),
  creatorAddress: z.string().optional(),
  clientEmail: z.string().email(),
  clientName: z.string().optional(),
  clientAddress: z.string().optional(),
  items: z.array(InvoiceItemSchema),
  subtotal: z.string(),
  tax: z.string().optional(),
  taxRate: z.string().optional(),
  total: z.string(),
  token: z.string(),
  chain: z.enum(["celo"]),
  dueDate: z.string(),
  notes: z.string().optional(),
});

const PayInvoiceSchema = z.object({
  invoiceId: z.string(),
  transactionHash: z.string(),
});

const router = Router();
router.get('/', async (req: Request, res: Response) => {
  try {
    const { invoiceId, invoiceNumber, creatorUserId, clientEmail } = req.query;
    if (invoiceId) {
      const invoice = await mongoDb.getInvoiceById(invoiceId as string);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      return res.status(200).json(invoice);
    }
    if (invoiceNumber) {
      const invoice = await mongoDb.getInvoiceByNumber(invoiceNumber as string);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      return res.status(200).json(invoice);
    }
    if (creatorUserId) {
      const invoices = await mongoDb.getInvoicesByCreator(creatorUserId as string);
      return res.status(200).json(invoices);
    }
    if (clientEmail) {
      const invoices = await mongoDb.getInvoicesByClient(clientEmail as string);
      return res.status(200).json(invoices);
    }
    return res.status(400).json({ error: "Missing query parameters" });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = CreateInvoiceSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }
    const data = validation.data;
    const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    const date = new Date();
    const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    const invoiceNumber = `INV-${dateStr}-${random}`;
    const invoice: Invoice = {
      invoiceId,
      invoiceNumber,
      creatorUserId: data.creatorUserId,
      creatorEmail: data.creatorEmail.toLowerCase().trim(),
      creatorName: data.creatorName,
      creatorAddress: data.creatorAddress,
      clientEmail: data.clientEmail.toLowerCase().trim(),
      clientName: data.clientName,
      clientAddress: data.clientAddress,
      items: data.items as InvoiceItem[],
      subtotal: data.subtotal,
      tax: data.tax,
      taxRate: data.taxRate,
      total: data.total,
      token: data.token,
      chain: data.chain,
      status: "draft",
      issueDate: now,
      dueDate: data.dueDate,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };
    await mongoDb.createInvoice(invoice);
    return res.status(201).json(invoice);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch('/', async (req: Request, res: Response) => {
  try {
    const { invoiceId, action } = req.query;
    if (!invoiceId || !action) {
      return res.status(400).json({ error: "Missing invoiceId or action" });
    }
    const invoice = await mongoDb.getInvoiceById(invoiceId as string);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    const now = new Date().toISOString();
    if (action === "send") {
      if (invoice.status !== "draft") {
        return res.status(400).json({ error: "Only draft invoices can be sent" });
      }
      const updated = await mongoDb.updateInvoice(invoiceId as string, { status: "sent" as InvoiceStatus, updatedAt: now });
      return res.status(200).json(updated);
    }
    if (action === "pay") {
      const validation = PayInvoiceSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }
      if (invoice.status !== "sent" && invoice.status !== "overdue") {
        return res.status(400).json({ error: "Invoice cannot be paid in current status" });
      }
      const data = validation.data;
      const updated = await mongoDb.updateInvoice(invoiceId as string, { status: "paid" as InvoiceStatus, transactionHash: data.transactionHash, paidAt: now, updatedAt: now });
      return res.status(200).json(updated);
    }
    if (action === "cancel") {
      if (invoice.status === "paid") {
        return res.status(400).json({ error: "Paid invoices cannot be cancelled" });
      }
      const updated = await mongoDb.updateInvoice(invoiceId as string, { status: "cancelled" as InvoiceStatus, updatedAt: now });
      return res.status(200).json(updated);
    }
    return res.status(400).json({ error: "Invalid action" });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
