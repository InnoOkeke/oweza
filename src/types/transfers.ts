export type TransferIntent = {
  recipientEmail: string;
  recipientAddress?: string; // Optional direct address (e.g. for escrow)
  amountCusd: number;
  memo?: string;
  senderEmail?: string;
  senderName?: string;
  senderUserId?: string;
  skipNotification?: boolean;
};

export type TransferResult = {
  intent: TransferIntent;
  status: "sent" | "pending_recipient_signup";
  txHash?: `0x${string}`;
  redemptionCode?: string;
  recipientWallet?: string;
  pendingTransferId?: string;
};

export type TransferRecord = TransferResult & {
  id: string;
  createdAt: string;
  senderWallet: string;
};
