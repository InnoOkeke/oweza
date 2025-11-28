import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const INVOICES_KEY = '@metasend:invoices';

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  fromEmail: string;
  fromWallet: string;
  fromName: string;
  fromAddress?: string;
  toEmail: string;
  toName: string;
  toAddress?: string;
  items: InvoiceItem[];
  subtotal: number;
  tax?: number;
  taxRate?: number;
  total: number;
  currency: string;
  notes?: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  createdAt: string;
  sentAt?: string;
  paidAt?: string;
  txHash?: string;
}

/**
 * Generate invoice number
 */
function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
}

/**
 * Create invoice
 */
export async function createInvoice(
  fromEmail: string,
  fromWallet: string,
  fromName: string,
  toEmail: string,
  toName: string,
  items: InvoiceItem[],
  currency: string,
  dueDate: string,
  options?: {
    fromAddress?: string;
    toAddress?: string;
    taxRate?: number;
    notes?: string;
  }
): Promise<Invoice> {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const tax = options?.taxRate ? subtotal * (options.taxRate / 100) : 0;
  const total = subtotal + tax;

  const invoice: Invoice = {
    id: uuidv4(),
    invoiceNumber: generateInvoiceNumber(),
    fromEmail,
    fromWallet,
    fromName,
    fromAddress: options?.fromAddress,
    toEmail,
    toName,
    toAddress: options?.toAddress,
    items,
    subtotal,
    tax,
    taxRate: options?.taxRate,
    total,
    currency,
    notes: options?.notes,
    dueDate,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };

  const invoices = await getInvoices();
  invoices.push(invoice);
  await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));

  return invoice;
}

/**
 * Get invoices for a user
 */
export async function getInvoices(
  email?: string,
  status?: Invoice['status']
): Promise<Invoice[]> {
  const data = await AsyncStorage.getItem(INVOICES_KEY);
  let invoices: Invoice[] = data ? JSON.parse(data) : [];

  if (email) {
    invoices = invoices.filter(
      inv => inv.fromEmail === email || inv.toEmail === email
    );
  }

  if (status) {
    invoices = invoices.filter(inv => inv.status === status);
  }

  return invoices.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get invoice by ID
 */
export async function getInvoice(id: string): Promise<Invoice | null> {
  const invoices = await getInvoices();
  return invoices.find(inv => inv.id === id) || null;
}

/**
 * Send invoice
 */
export async function sendInvoice(id: string): Promise<Invoice | null> {
  const invoices = await getInvoices();
  const invoice = invoices.find(inv => inv.id === id);
  
  if (!invoice) return null;

  invoice.status = 'sent';
  invoice.sentAt = new Date().toISOString();

  await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));

  // TODO: Send email with invoice

  return invoice;
}

/**
 * Mark invoice as paid
 */
export async function markInvoicePaid(
  id: string,
  txHash: string
): Promise<Invoice | null> {
  const invoices = await getInvoices();
  const invoice = invoices.find(inv => inv.id === id);
  
  if (!invoice) return null;

  invoice.status = 'paid';
  invoice.paidAt = new Date().toISOString();
  invoice.txHash = txHash;

  await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));

  return invoice;
}

/**
 * Cancel invoice
 */
export async function cancelInvoice(id: string): Promise<void> {
  const invoices = await getInvoices();
  const invoice = invoices.find(inv => inv.id === id);
  
  if (invoice) {
    invoice.status = 'cancelled';
    await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
  }
}

/**
 * Update invoice
 */
export async function updateInvoice(updatedInvoice: Invoice): Promise<void> {
  const invoices = await getInvoices();
  const index = invoices.findIndex(inv => inv.id === updatedInvoice.id);
  
  if (index !== -1) {
    invoices[index] = updatedInvoice;
    await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
  }
}

/**
 * Get invoice URL
 */
export function getInvoiceUrl(invoiceId: string): string {
  return `https://metasend.io/invoice/${invoiceId}`;
}
