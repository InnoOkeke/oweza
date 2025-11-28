/**
 * Invoice Service
 * Handle creating and managing invoices
 */

import { z } from "zod";
import { Invoice, InvoiceItem, InvoiceStatus, ChainType } from "../types/database";

export const InvoiceItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().min(1),
  unitPrice: z.string(),
  amount: z.string(),
});

export const CreateInvoiceSchema = z.object({
  clientEmail: z.string().email(),
  clientName: z.string().optional(),
  clientAddress: z.string().optional(),
  items: z.array(InvoiceItemSchema).min(1),
  subtotal: z.string(),
  taxRate: z.string().optional(),
  tax: z.string().optional(),
  total: z.string(),
  token: z.string(),
  chain: z.enum(["base"]),
  dueDate: z.string(), // ISO date
  notes: z.string().optional(),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

export type InvoiceSummary = {
  invoiceId: string;
  invoiceNumber: string;
  creatorEmail: string;
  creatorName?: string;
  clientEmail: string;
  clientName?: string;
  total: string;
  token: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidAt?: string;
};

declare const require: any;

const getApiBaseUrl = () => {
  try {
    const Constants = require("expo-constants").default;
    return Constants?.expoConfig?.extra?.metasendApiBaseUrl || process.env.METASEND_API_BASE_URL || "https://metasend-api.onrender.com";
  } catch (_error) {
    return process.env.METASEND_API_BASE_URL || "https://metasend-api.onrender.com";
  }
};

class InvoiceService {
  private readonly apiBaseUrl = getApiBaseUrl();

  /**
   * Create a new invoice
   */
  async createInvoice(
    creatorUserId: string,
    creatorEmail: string,
    creatorName: string | undefined,
    creatorAddress: string | undefined,
    input: CreateInvoiceInput
  ): Promise<Invoice> {
    const validated = CreateInvoiceSchema.parse(input);

    const response = await fetch(`${this.apiBaseUrl}/api/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creatorUserId,
        creatorEmail,
        creatorName,
        creatorAddress,
        ...validated,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error ? JSON.stringify(errorData.error) : "Failed to create invoice");
    }

    return await response.json();
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    const response = await fetch(`${this.apiBaseUrl}/api/invoices?invoiceId=${invoiceId}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  }

  /**
   * Get invoices created by user
   */
  async getMyInvoices(userId: string): Promise<InvoiceSummary[]> {
    const response = await fetch(`${this.apiBaseUrl}/api/invoices?creatorUserId=${userId}`);
    if (!response.ok) {
      return [];
    }
    return await response.json();
  }

  /**
   * Get invoices for client email
   */
  async getInvoicesForClient(email: string): Promise<InvoiceSummary[]> {
    const response = await fetch(`${this.apiBaseUrl}/api/invoices?clientEmail=${email}`);
    if (!response.ok) {
      return [];
    }
    return await response.json();
  }

  /**
   * Send invoice to client
   */
  async sendInvoice(invoiceId: string, userId: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/api/invoices?invoiceId=${invoiceId}&action=send`, {
      method: "PATCH",
    });
    if (!response.ok) {
      throw new Error("Failed to send invoice");
    }
  }

  /**
   * Mark invoice as paid
   */
  async markInvoicePaid(
    invoiceId: string,
    transactionHash: string
  ): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/api/invoices?invoiceId=${invoiceId}&action=pay`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionHash }),
    });
    if (!response.ok) {
      throw new Error("Failed to mark invoice as paid");
    }
  }

  /**
   * Cancel invoice
   */
  async cancelInvoice(invoiceId: string, userId: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/api/invoices?invoiceId=${invoiceId}&action=cancel`, {
      method: "PATCH",
    });
    if (!response.ok) {
      throw new Error("Failed to cancel invoice");
    }
  }

  /**
   * Check for overdue invoices
   */
  async checkOverdueInvoices(): Promise<void> {
    // This would typically be a background job on the server
    console.log("⏰ Checking for overdue invoices...");
  }

  /**
   * Generate invoice number
   */
  private generateInvoiceNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    return `INV-${year}${month}-${random}`;
  }

  /**
   * Generate shareable invoice link
   */
  generateInvoiceLink(invoiceId: string): string {
    return `https://metasend.vercel.app/invoice/${invoiceId}`;
  }

  /**
   * Calculate invoice totals
   */
  calculateInvoiceTotals(items: InvoiceItem[], taxRate?: string): {
    subtotal: string;
    tax: string;
    total: string;
  } {
    const subtotal = items.reduce((sum, item) => {
      return sum + parseFloat(item.amount);
    }, 0);

    const tax = taxRate ? subtotal * (parseFloat(taxRate) / 100) : 0;
    const total = subtotal + tax;

    return {
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
    };
  }
}

export const invoiceService = new InvoiceService();
