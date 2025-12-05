/**
 * Database type definitions for Oweza
 * These can be implemented with Firebase, Supabase, MongoDB, etc.
 */

export type ChainType = "celo";

export type User = {
  userId: string;
  email: string;
  emailVerified: boolean;
  wallets: {
    celo?: string;
  };
  profile: {
    displayName?: string;
    avatar?: string;
  };
  createdAt: string;
  lastLoginAt: string;
};

export type PendingTransferStatus = "pending" | "claimed" | "cancelled" | "expired";

export type PendingTransfer = {
  transferId: string;
  recipientEmail: string;
  senderUserId: string;
  senderEmail: string;
  senderName?: string;

  // Transfer details
  amount: string;
  token: string;
  tokenAddress: string;
  chain: ChainType;
  decimals: number;

  // Status
  status: PendingTransferStatus;

  // Escrow wallet (holds funds)
  escrowAddress?: string;
  escrowPrivateKeyEncrypted?: string;
  transactionHash?: string; // Deprecated legacy field

  // Shared escrow metadata
  escrowTransferId?: string;
  escrowTxHash?: string;
  escrowStatus?: "pending" | "claimed" | "refunded" | "expired";
  recipientHash?: string;
  recipientWallet?: string;
  lastChainSyncAt?: string;

  // HTLC escrow metadata (for secret-based claims)
  claimSecret?: string; // Cryptographic secret for gasless claims (encrypted in storage)
  secretHash?: string; // keccak256(secret) stored in HTLC contract

  // Metadata
  message?: string;
  createdAt: string;
  expiresAt: string;
  claimedAt?: string;
  claimedByUserId?: string;
  claimTransactionHash?: string;
};

export type Contact = {
  userId: string;
  recipientEmail: string;
  recipientUserId?: string;
  recipientName?: string;
  lastSentAt: string;
  totalSent: number;
  favorite: boolean;
};

export type TransferNotification = {
  notificationId: string;
  userId: string;
  type: "transfer_received" | "transfer_sent" | "pending_claimed" | "pending_expired" | "invite_sent";
  title: string;
  message: string;
  metadata: Record<string, any>;
  read: boolean;
  createdAt: string;
};

export type TipJarStatus = "active" | "paused" | "closed";

export type TipJar = {
  jarId: string;
  creatorUserId: string;
  creatorEmail: string;
  creatorName?: string;
  creatorAvatar?: string;

  // Jar details
  title: string;
  description?: string;
  username?: string;
  socialLinks?: {
    twitter?: string;
    farcaster?: string;
    instagram?: string;
    website?: string;
  };
  walletAddresses?: {
    celo?: string;
  };
  suggestedAmounts: number[]; // e.g., [1, 5, 10, 25]
  acceptedTokens: { token: string; chain: ChainType }[];

  // Status
  status: TipJarStatus;
  totalTipsReceived: number;
  tipCount: number;

  // Metadata
  createdAt: string;
  updatedAt: string;
};

export type Tip = {
  tipId: string;
  jarId: string;

  // Tipper info
  tipperUserId?: string;
  tipperEmail?: string;
  tipperName?: string;
  isAnonymous: boolean;

  // Tip details
  amount: string;
  token: string;
  chain: ChainType;
  message?: string;

  // Transaction
  transactionHash: string;

  // Metadata
  createdAt: string;
};

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
};

export type Invoice = {
  invoiceId: string;
  invoiceNumber: string;

  // Creator (merchant)
  creatorUserId: string;
  creatorEmail: string;
  creatorName?: string;
  creatorAddress?: string;

  // Client
  clientEmail: string;
  clientUserId?: string;
  clientName?: string;
  clientAddress?: string;

  // Invoice details
  items: InvoiceItem[];
  subtotal: string;
  tax?: string;
  taxRate?: string;
  total: string;
  token: string;
  chain: ChainType;

  // Status
  status: InvoiceStatus;

  // Dates
  issueDate: string;
  dueDate: string;
  paidAt?: string;

  // Payment
  transactionHash?: string;

  // Metadata
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type GiftTheme = "birthday" | "anniversary" | "holiday" | "thank_you" | "congratulations" | "red_envelope" | "custom";
export type GiftStatus = "pending" | "claimed" | "expired" | "cancelled";

export type CryptoGift = {
  giftId: string;

  // Sender
  senderUserId: string;
  senderEmail: string;
  senderName?: string;

  // Recipient
  recipientEmail: string;
  recipientUserId?: string;
  recipientName?: string;

  // Gift details
  amount: string;
  token: string;
  chain: ChainType;
  theme: GiftTheme;
  message?: string;

  // Gift claim code
  giftCode: string; // Format: GIFT-THEME-RANDOM (e.g., GIFT-BDAY-X7K9M2)

  // Link to pending transfer (for unregistered recipients)
  pendingTransferId?: string;

  // Escrow (for unclaimed gifts) - Legacy
  escrowAddress?: string;
  escrowPrivateKeyEncrypted?: string;

  // HTLC escrow metadata (for secret-based claims)
  claimSecret?: string; // Cryptographic secret for gasless claims
  secretHash?: string; // keccak256(secret) stored in HTLC contract

  // Status
  status: GiftStatus;

  // Transaction
  transactionHash?: string;
  claimTransactionHash?: string;

  // Dates
  createdAt: string;
  expiresAt?: string;
  claimedAt?: string;
};
