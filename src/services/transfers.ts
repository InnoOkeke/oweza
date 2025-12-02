import { resolveEmailToWallet } from "./addressResolution";
import { emailNotificationService } from "./EmailNotificationService";
import { escrowService } from "./EscrowService";
import { getCusdBalance, encodeCusdTransfer, getCusdAllowance, encodeCusdApprove } from "./blockchain";
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

  const GAS_BUFFER = 0.05; // 0.05 cUSD buffer for gas fees
  if (balance < amountCusd + GAS_BUFFER) {
    throw new Error(`Insufficient balance. You need ${(amountCusd + GAS_BUFFER).toFixed(2)} cUSD (incl. gas). You have ${balance.toFixed(2)} cUSD.`);
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
      const pendingRecord = await enqueuePendingTransfer(senderAddress, intent, sendUserOperationFn);
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

  console.log("📧 Preparing to send email notifications:");
  console.log("   - Sender Email:", intent.senderEmail || "(not provided)");
  console.log("   - Sender Name:", senderName);
  console.log("   - Recipient Email:", intent.recipientEmail);
  console.log("   - Skip Notification:", intent.skipNotification ? "YES" : "NO");

  const notificationPromises: Promise<boolean>[] = [];

  if (!intent.skipNotification) {
    console.log("📨 Queuing recipient notification email to:", intent.recipientEmail);
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
  } else {
    console.log("⏭️ Skipping recipient notification (skipNotification = true)");
  }

  if (intent.senderEmail) {
    console.log("📨 Queuing sender confirmation email to:", intent.senderEmail);
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
  } else {
    console.log("⏭️ Skipping sender confirmation (no sender email provided)");
  }

  console.log(`📬 Sending ${notificationPromises.length} email(s)...`);

  Promise.allSettled(notificationPromises)
    .then((results) => {
      results.forEach((result, index) => {
        const emailType = index === 0 ? "Recipient notification" : "Sender confirmation";
        if (result.status === "fulfilled") {
          const success = result.value;
          if (success) {
            console.log(`✅ ${emailType} sent successfully`);
          } else {
            console.warn(`⚠️ ${emailType} failed (returned false)`);
          }
        } else {
          console.error(`❌ ${emailType} failed with error:`, result.reason);
        }
      });
    })
    .catch((error) => console.error("❌ Email notification promise rejected:", error));

  return record;
}

async function enqueuePendingTransfer(
  senderAddress: `0x${string}`,
  intent: TransferIntent,
  sendUserOperationFn: (calls: any[]) => Promise<{ userOperationHash: string }>
): Promise<TransferResult> {
  if (!intent.senderUserId) {
    throw new Error("Sender identity required for pending transfers");
  }

  console.log("🔒 Generating escrow transaction data...");
  const receipt = await escrowService.createOnchainTransfer({
    recipientEmail: intent.recipientEmail,
    amount: intent.amountCusd.toString(),
    decimals: CUSD_DECIMALS,
    tokenAddress: CUSD_TOKEN_ADDRESS,
    chain: "celo",
    fundingWallet: senderAddress,
  });

  if (!receipt.callData || !receipt.to) {
    throw new Error("Failed to generate escrow transaction data");
  }

  // Check allowance
  const escrowAddress = receipt.to as `0x${string}`;
  const allowance = await getCusdAllowance(senderAddress, escrowAddress);

  console.log("� Debug Escrow Transaction:");
  console.log("   - Escrow Contract:", escrowAddress);
  console.log("   - Token Address:", CUSD_TOKEN_ADDRESS);
  console.log("   - Sender:", senderAddress);
  console.log("   - Amount:", intent.amountCusd);
  console.log("   - Allowance:", allowance);
  console.log("   - Call Data:", receipt.callData);

  const calls = [];

  if (allowance < intent.amountCusd) {
    console.log("📝 Adding approve call for Escrow contract (Large Approval)");
    // Approve a large amount (1M cUSD) to avoid repeated approvals and gas costs
    const approveData = encodeCusdApprove(escrowAddress, 1000000);
    calls.push({
      to: CUSD_TOKEN_ADDRESS,
      value: 0n,
      data: approveData,
    });
  }

  calls.push({
    to: receipt.to,
    value: receipt.value || 0n,
    data: receipt.callData,
  });

  console.log(`⚡ Executing escrow creation on-chain (${calls.length} calls)...`);
  const result = await sendUserOperationFn(calls);

  const txHash = result.userOperationHash as `0x${string}`;
  console.log("✅ Escrow transaction sent! Hash:", txHash);

  // Use the REAL transaction hash from the user operation, not the placeholder from escrowService
  const transfer = await createPendingTransfer({
    recipientEmail: intent.recipientEmail,
    senderUserId: intent.senderUserId,
    amount: intent.amountCusd.toString(),
    token: DEFAULT_TOKEN_SYMBOL,
    tokenAddress: CUSD_TOKEN_ADDRESS,
    chain: "celo",
    decimals: CUSD_DECIMALS,
    message: intent.memo,
    escrowTransferId: receipt.transferId,
    escrowTxHash: txHash, // This is the REAL hash from the blockchain transaction
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
