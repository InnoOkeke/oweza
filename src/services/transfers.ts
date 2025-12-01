import { resolveEmailToWallet } from "./addressResolution";
import { emailNotificationService } from "./EmailNotificationService";
import { getCusdBalance, encodeCusdTransfer } from "./blockchain";
import { CUSD_TOKEN_ADDRESS, CUSD_DECIMALS } from "../config/celo";
import { createPendingTransfer } from "./api";
import type { TransferIntent, TransferRecord, TransferResult } from "../types/transfers";

export type { TransferIntent, TransferRecord, TransferResult } from "../types/transfers";

declare const require: any;

type ExpoExtra = {
  owezaApiBaseUrl?: string;
  owezaApiKey?: string;
};

const DEFAULT_TOKEN_SYMBOL = "cUSD";
const CHAIN_NAME = "Celo";
const isReactNative = typeof navigator !== "undefined" && navigator.product === "ReactNative";

const getExpoExtra = (): ExpoExtra => {
  if (!isReactNative) {
    return {};
  }

  try {
    const Constants = require("expo-constants").default;
    return (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;
  } catch (_error) {
    return {} as ExpoExtra;
  }
};

const extra = getExpoExtra();
const apiBaseUrl = (isReactNative ? extra.owezaApiBaseUrl : process.env.OWEZA_API_BASE_URL) || "";
const apiKey = (isReactNative ? extra.owezaApiKey : process.env.OWEZA_API_KEY) || "";

const ensureApiConfig = () => {
  if (!apiBaseUrl || !apiKey) {
    throw new Error("Oweza API configuration missing. Set OWEZA_API_BASE_URL and OWEZA_API_KEY.");
  }
};

const apiRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  ensureApiConfig();

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...(init || {}),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
};

const persistTransferRecord = async (record: TransferRecord): Promise<void> => {
  // Map amountCusd to amountUsdc for backend compatibility
  const payload = {
    ...record,
    intent: {
      ...record.intent,
      amountUsdc: record.intent.amountCusd,
    },
  };

  await apiRequest<{ success: boolean }>("/api/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

const fetchTransferHistory = async (walletAddress: string): Promise<TransferRecord[]> => {
  // Fetch both sent and received transfers using Promise.allSettled to handle potential failures
  // (e.g. if the backend doesn't support recipientWallet yet)
  const results = await Promise.allSettled([
    apiRequest<{ success: boolean; transfers?: TransferRecord[] }>(
      `/api/transfers?senderWallet=${encodeURIComponent(walletAddress)}`
    ),
    apiRequest<{ success: boolean; transfers?: TransferRecord[] }>(
      `/api/transfers?recipientWallet=${encodeURIComponent(walletAddress)}`
    ),
  ]);

  const sentTransfers: TransferRecord[] =
    results[0].status === 'fulfilled' ? (results[0].value.transfers ?? []) : [];

  const receivedTransfers: TransferRecord[] =
    results[1].status === 'fulfilled' ? (results[1].value.transfers ?? []) : [];

  if (results[0].status === 'rejected') {
    console.warn('⚠️ Failed to fetch sent transfers:', results[0].reason);
  }
  if (results[1].status === 'rejected') {
    console.warn('⚠️ Failed to fetch received transfers:', results[1].reason);
  }

  // Merge and deduplicate by transfer ID
  const allTransfers = [...sentTransfers];
  const sentIds = new Set(sentTransfers.map(t => t.id));

  for (const transfer of receivedTransfers) {
    if (!sentIds.has(transfer.id)) {
      allTransfers.push(transfer);
    }
  }

  console.log("📋 Synced", allTransfers.length, "transfers (", sentTransfers.length, "sent,", receivedTransfers.length, "received) for", walletAddress.slice(0, 6));
  return allTransfers;
};

export async function listTransfers(senderWallet: string): Promise<TransferRecord[]> {
  if (!senderWallet) {
    return [];
  }
  return fetchTransferHistory(senderWallet);
}

export async function sendCusdWithPaymaster(
  walletAddress: `0x${string}`,
  intent: TransferIntent,
  sendUserOperationFn: (calls: any[]) => Promise<{ userOperationHash: string }>
): Promise<TransferResult> {
  console.log("🚀 Starting transfer:", {
    from: walletAddress.slice(0, 6),
    to: intent.recipientEmail,
    amount: intent.amountCusd,
  });

  const { recipientEmail, recipientAddress: directAddress, amountCusd } = intent;

  if (amountCusd <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  // Check cUSD balance before proceeding
  console.log("💰 Checking balance for", walletAddress.slice(0, 6));
  const balance = await getCusdBalance(walletAddress);
  console.log("💵 Balance:", balance.toFixed(2), "cUSD");

  if (balance < amountCusd) {
    throw new Error(`Insufficient cUSD balance. You have ${balance.toFixed(2)} cUSD but need ${amountCusd.toFixed(2)} cUSD`);
  }

  const senderAddress = assertHexAddress(walletAddress, "Sender wallet");
  let recipientAddress: `0x${string}`;
  let contact: { isRegistered: boolean; walletAddress?: string; displayName?: string } = { isRegistered: false };

  if (directAddress) {
    console.log("🔗 Using direct recipient address:", directAddress);
    recipientAddress = assertHexAddress(directAddress, "Recipient address");
    contact = { isRegistered: true, walletAddress: directAddress };
  } else {
    console.log("🔍 Resolving recipient:", recipientEmail);
    contact = await resolveEmailToWallet({ email: recipientEmail });
    console.log("✅ Recipient resolved:", { isRegistered: contact.isRegistered, wallet: contact.walletAddress?.slice(0, 6) });

    if (!contact.isRegistered || !contact.walletAddress) {
      console.log("📧 Creating pending transfer (unregistered user)");
      const pendingRecord = await enqueuePendingTransfer(senderAddress, intent);
      return pendingRecord;
    }
    recipientAddress = assertHexAddress(contact.walletAddress, "Recipient wallet");
  }

  // Encode cUSD transfer call
  console.log("📝 Encoding cUSD transfer");
  const transferCallData = encodeCusdTransfer(recipientAddress, amountCusd);

  // Execute the user operation via AppKit
  console.log("⚡ Executing user operation via AppKit...");
  const result = await sendUserOperationFn([
    {
      to: CUSD_TOKEN_ADDRESS,
      value: 0n,
      data: transferCallData,
    },
  ]);

  const txHash = result.userOperationHash as `0x${string}`;
  console.log("✅ Transaction sent! Hash:", txHash);

  const record: TransferRecord = {
    id: `tx_${Date.now()}`,
    createdAt: new Date().toISOString(),
    senderWallet: walletAddress,
    intent,
    status: "sent",
    txHash,
    recipientWallet: contact.walletAddress,
  };

  await persistTransferRecord(record);
  console.log("☁️ Transfer record saved to API");

  // Fire-and-forget email notifications for registered recipients
  const senderName = intent.senderName ?? intent.senderEmail ?? walletAddress.slice(0, 6);
  const recipientName = contact.displayName ?? intent.recipientEmail;
  const amountDisplay = intent.amountCusd.toString();

  const notificationPromises: Promise<boolean>[] = [];

  if (!intent.skipNotification) {
    notificationPromises.push(
      emailNotificationService.sendTransferNotification(
        intent.recipientEmail,
        recipientName,
        senderName,
        amountDisplay,
        DEFAULT_TOKEN_SYMBOL,
        CHAIN_NAME
      )
    );
  }

  if (intent.senderEmail) {
    notificationPromises.push(
      emailNotificationService.sendTransferConfirmation(
        intent.senderEmail,
        senderName,
        intent.recipientEmail,
        amountDisplay,
        DEFAULT_TOKEN_SYMBOL,
        "sent"
      )
    );
  }

  Promise.allSettled(notificationPromises)
    .then((results) => {
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          console.log(index === 0 ? "📨 Recipient notified" : "📨 Sender confirmation sent");
        } else {
          console.warn("⚠️ Email notification failed:", result.reason);
        }
      });
    })
    .catch((error) => console.warn("⚠️ Email notification promise rejected:", error));

  return record;
}

async function enqueuePendingTransfer(
  senderAddress: `0x${string}`,
  intent: TransferIntent
): Promise<TransferResult> {
  if (!intent.senderUserId) {
    throw new Error("Sender identity required for pending transfers");
  }

  const transfer = await createPendingTransfer({
    recipientEmail: intent.recipientEmail,
    senderUserId: intent.senderUserId,
    amount: intent.amountCusd.toString(),
    token: DEFAULT_TOKEN_SYMBOL,
    tokenAddress: CUSD_TOKEN_ADDRESS,
    chain: "celo",
    decimals: CUSD_DECIMALS,
    message: intent.memo,
  });
  const record: TransferRecord = {
    id: `pending_${Date.now()}`,
    createdAt: new Date().toISOString(),
    senderWallet: senderAddress,
    intent,
    status: "pending_recipient_signup",
    redemptionCode: transfer.transferId,
    pendingTransferId: transfer.transferId,
  };

  await persistTransferRecord(record);
  console.log("☁️ Pending transfer saved to API");

  return record;
}


const assertHexAddress = (value: string | undefined | null, label: string): `0x${string}` => {
  if (!value || !value.startsWith("0x")) {
    throw new Error(`${label} must be a valid 0x-prefixed Celo wallet.`);
  }
  return value as `0x${string}`;
};
