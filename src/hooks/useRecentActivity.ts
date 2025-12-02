import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listTransfers, TransferRecord } from '../services/transfers';
import { getTips, Tip } from '../services/tipping';
import { getCryptoGifts, CryptoGift } from '../services/gifts';
import { getInvoices, Invoice } from '../services/invoices';
import { getCusdTransactions, BlockchainTransaction } from '../services/blockchain';
import { useAuth } from '../providers/Web3AuthProvider';

export type ActivityType =
    | 'transfer-sent'
    | 'transfer-received'
    | 'tip-sent'
    | 'tip-received'
    | 'gift-sent'
    | 'gift-received'
    | 'invoice-sent'
    | 'invoice-received'
    | 'blockchain-sent'
    | 'blockchain-received';

export interface ActivityItem {
    id: string;
    type: ActivityType;
    title: string;
    subtitle?: string;
    amount: number;
    currency: string;
    timestamp: number;
    status: 'pending' | 'completed' | 'failed' | 'expired' | 'cancelled';
    txHash?: string;
    metadata?: {
        from?: string;
        to?: string;
        message?: string;
        [key: string]: any;
    };
}

export function useRecentActivity() {
    // Debug: Print aggregated gifts and paymentRequests before mapping
    // Debug: Print raw fetched data for each activity type
    const { profile } = useAuth();
    const walletAddress = profile?.walletAddress;
    const email = profile?.email;
    // Debug log for walletAddress
    if (typeof walletAddress !== 'undefined') {
        console.log('[useRecentActivity] walletAddress:', walletAddress);
    } else {
        console.log('[useRecentActivity] walletAddress is undefined');
    }
    console.log('[useRecentActivity] profile:', profile ? 'exists' : 'null');

    // 1. Transfers (App-level)
    const { data: transfers = [] } = useQuery({
        queryKey: ['transfers', 'wallet', walletAddress],
        queryFn: () => walletAddress ? listTransfers(walletAddress) : [],
        enabled: !!walletAddress,
    });

    // 2. Tips
    const { data: tips = [] } = useQuery({
        queryKey: ['tips', walletAddress, email],
        queryFn: () => (walletAddress || email) ? getTips(walletAddress, email) : [],
        enabled: !!(walletAddress || email),
    });

    // 3. Gifts
    const { data: gifts = [] } = useQuery({
        queryKey: ['gifts', email],
        queryFn: () => email ? getCryptoGifts(email) : [],
        enabled: !!email,
    });

    // 4. Invoices (replaces payment requests)

    // 5. Invoices
    const { data: invoices = [] } = useQuery({
        queryKey: ['invoices', email],
        queryFn: () => email ? getInvoices(email) : [],
        enabled: !!email,
    });

    // 6. Blockchain Transactions
    const { data: blockchainTxs = [] } = useQuery({
        queryKey: ['blockchainTransactions', walletAddress],
        queryFn: async () => {
            if (!walletAddress) return [];
            console.log('🔍 Fetching CUSD transactions for wallet:', walletAddress);
            const txs = await getCusdTransactions(walletAddress as `0x${string}`);
            console.log('📊 CUSD transactions fetched:', txs.length, 'transactions');
            return txs;
        },
        enabled: !!walletAddress,
    });

    const activities = useMemo(() => {
        const allActivities: ActivityItem[] = [];

        // const isAAWallet = !!(walletAddress && walletAddress.toLowerCase().startsWith('0x'));
        // if (!isAAWallet) {
        //     const noWalletItem: ActivityItem = {
        //         id: 'no-aa-wallet',
        //         type: 'transfer-sent',
        //         title: 'No smart account detected',
        //         subtitle: 'Please sign in with your AA wallet.',
        //         amount: 0,
        //         currency: 'cUSD',
        //         timestamp: Date.now(),
        //         status: 'failed',
        //     };
        //     return [noWalletItem];
        // }

        // Tips: include sent and received (completed)
        (tips || []).forEach((t: Tip) => {
            const status = t.status || 'completed';
            // Include all statuses, map to ActivityItem status
            const activityStatus = status === 'pending' ? 'pending' : status === 'expired' ? 'expired' : 'completed';
            const isSender = (t.fromWallet && t.fromWallet.toLowerCase() === walletAddress?.toLowerCase()) || t.fromEmail === email;
            const isRecipient = (t.toWallet && t.toWallet.toLowerCase() === walletAddress?.toLowerCase()) || t.toEmail === email;
            if (isSender) {
                allActivities.push({
                    id: t.id,
                    type: 'tip-sent',
                    title: 'You Just Tipped',
                    subtitle: t.toEmail ? `To: ${t.toEmail}` : 'Sent via link',
                    amount: -Number(t.amount),
                    currency: t.currency || 'cUSD',
                    timestamp: new Date(t.createdAt).getTime(),
                    status: activityStatus,
                    txHash: t.txHash,
                    metadata: { from: t.fromEmail, to: t.toEmail, message: t.message },
                });
            } else if (isRecipient) {
                allActivities.push({
                    id: t.id + '-received',
                    type: 'tip-received',
                    title: 'You earned a tip',
                    subtitle: t.fromEmail ? `From: ${t.fromEmail}` : 'Received via link',
                    amount: Number(t.amount),
                    currency: t.currency || 'cUSD',
                    timestamp: new Date(t.createdAt).getTime(),
                    status: activityStatus,
                    txHash: t.txHash,
                    metadata: { from: t.fromEmail, to: t.toEmail, message: t.message },
                });
            }
        });

        // Gifts: include sent and received
        (gifts || []).forEach((g: CryptoGift) => {
            const status = g.status;
            // Include pending (unclaimed) gifts
            const activityStatus = status === 'claimed' ? 'completed' : 'pending';
            const isSender = g.fromEmail === email || g.fromWallet === walletAddress;
            const isRecipient = g.toEmail === email || g.toWallet === walletAddress;
            const amount = Number(g.amount);
            if (isSender) {
                allActivities.push({
                    id: `${g.id}-sent`,
                    type: 'gift-sent',
                    title: `Gift sent`,
                    subtitle: g.toName ? `To: ${g.toName}` : `To: ${g.toEmail}`,
                    amount: -amount,
                    currency: g.currency,
                    timestamp: new Date(g.createdAt).getTime(),
                    status: activityStatus,
                    txHash: g.txHash,
                    metadata: { from: g.fromName, to: g.toName, message: g.message, theme: g.theme },
                });
            }
            if (isRecipient) {
                allActivities.push({
                    id: `${g.id}-received`,
                    type: 'gift-received',
                    title: `You Got a Gift`,
                    subtitle: g.fromName ? `From: ${g.fromName}` : `From: ${g.fromEmail}`,
                    amount: amount,
                    currency: g.currency,
                    timestamp: new Date(g.claimedAt || g.createdAt).getTime(),
                    status: activityStatus,
                    txHash: g.txHash,
                    metadata: { from: g.fromName, to: g.toName, message: g.message, theme: g.theme },
                });
            }
        });

        // Payment Requests removed - now using Transfers for sending cUSD via email

        // Transfers: include sent, received, and pending
        (transfers || []).forEach((t: TransferRecord) => {
            const status = t.status;
            // Include both completed transfers and pending ones
            if (status !== 'sent' && status !== 'pending_recipient_signup') return;

            const sender = t.senderWallet;
            const recipient = t.recipientWallet || t.intent.recipientEmail;
            const isSent = sender && sender.toLowerCase() === walletAddress?.toLowerCase();
            const isReceived = (recipient && typeof recipient === 'string' && recipient.toLowerCase() === walletAddress?.toLowerCase()) || (t.intent.recipientEmail === email);
            const amount = Number(t.intent.amountCusd);

            // Map transfer status to activity status
            const activityStatus = status === 'pending_recipient_signup' ? 'pending' : 'completed';

            if (isSent) {
                let type: ActivityType = 'transfer-sent';
                let title = status === 'pending_recipient_signup' ? 'Pending Transfer' : 'Payment Sent';
                const memo = t.intent.memo || '';

                // Only apply memo-based titles for completed transfers
                if (status === 'sent') {
                    if (memo.toLowerCase().includes('international')) { type = 'blockchain-sent'; title = 'Sent Internationally'; }
                    else if (memo.toLowerCase().includes('add funds')) { type = 'blockchain-received'; title = 'Add Funds'; }
                    else if (memo.toLowerCase().includes('withdraw')) { type = 'blockchain-sent'; title = 'Withdraw'; }
                    else if (memo.toLowerCase().includes('email')) { type = 'transfer-sent'; title = 'Sent via Email'; }
                }

                allActivities.push({
                    id: t.id,
                    type,
                    title,
                    subtitle: `To: ${t.intent.recipientEmail || recipient}`,
                    amount: -amount,
                    currency: 'cUSD',
                    timestamp: new Date(t.createdAt).getTime(),
                    status: activityStatus,
                    txHash: t.txHash,
                    metadata: {
                        to: t.intent.recipientEmail,
                        from: t.intent.senderEmail,
                        message: t.intent.memo,
                        pendingTransferId: t.pendingTransferId,
                        redemptionCode: t.redemptionCode
                    }
                });
            }
            if (isReceived && status === 'sent') {
                // Only show received transfers that are completed (not pending)
                allActivities.push({
                    id: `${t.id}-received`,
                    type: 'transfer-received',
                    title: 'You Got Paid',
                    subtitle: `From: ${t.intent.senderEmail || sender}`,
                    amount: amount,
                    currency: 'cUSD',
                    timestamp: new Date(t.createdAt).getTime(),
                    status: 'completed',
                    txHash: t.txHash,
                    metadata: {
                        from: t.intent.senderEmail,
                        to: t.intent.recipientEmail,
                        message: t.intent.memo
                    }
                });
            }
        });

        // Invoices: include sent/received (paid)
        (invoices || []).forEach((inv: Invoice) => {
            const status = inv.status;
            if (status !== 'paid') return;
            const amount = Number(inv.total);
            const isSender = inv.fromEmail === email; // I sent the invoice
            const isRecipient = inv.toEmail === email; // Invoice sent to me, and I paid it
            if (isSender) {
                // Someone paid my invoice
                allActivities.push({
                    id: `${inv.id}-received`,
                    type: 'invoice-received',
                    title: `Invoice paid`,
                    subtitle: `From: ${inv.toEmail}`,
                    amount: amount,
                    currency: inv.currency,
                    timestamp: new Date(inv.paidAt || inv.createdAt).getTime(),
                    status: 'completed',
                    txHash: inv.txHash,
                    metadata: { from: inv.fromEmail, to: inv.toEmail, description: inv.notes },
                });
            }
            if (isRecipient) {
                // I paid the invoice
                allActivities.push({
                    id: `${inv.id}-paid`,
                    type: 'invoice-sent',
                    title: `Invoice paid`,
                    subtitle: `To: ${inv.fromEmail}`,
                    amount: -amount,
                    currency: inv.currency,
                    timestamp: new Date(inv.paidAt || inv.createdAt).getTime(),
                    status: 'completed',
                    txHash: inv.txHash,
                    metadata: { from: inv.toEmail, to: inv.fromEmail, description: inv.notes },
                });
            }
        });

        // Blockchain transactions: include sent and received
        const knownHashes = new Set(allActivities.map(a => a.txHash).filter(Boolean));
        (blockchainTxs || []).forEach((tx: any) => {
            if (!tx || !tx.hash) return;
            if (knownHashes.has(tx.hash)) return;
            const from = tx.from && tx.from.toLowerCase();
            const to = tx.to && tx.to.toLowerCase();
            if (from === walletAddress?.toLowerCase()) {
                allActivities.push({ id: tx.hash, type: 'blockchain-sent', title: 'Sent cUSD', subtitle: `To: ${tx.to}`, amount: -Number(tx.value), currency: 'cUSD', timestamp: tx.timestamp || Date.now(), status: 'completed', txHash: tx.hash, metadata: { from: tx.from, to: tx.to } });
            } else if (to === walletAddress?.toLowerCase()) {
                allActivities.push({ id: tx.hash + '-in', type: 'blockchain-received', title: 'Received cUSD', subtitle: `From: ${tx.from}`, amount: Number(tx.value), currency: 'cUSD', timestamp: tx.timestamp || Date.now(), status: 'completed', txHash: tx.hash, metadata: { from: tx.from, to: tx.to } });
            }
        });


        const sorted = allActivities.sort((a, b) => b.timestamp - a.timestamp);
        if (sorted.length === 0) {
            const noActivityItem: ActivityItem = {
                id: 'no-activity',
                type: 'transfer-sent',
                title: 'No recent activity found',
                subtitle: 'No transactions for your AA wallet yet.',
                amount: 0,
                currency: 'cUSD',
                timestamp: Date.now(),
                status: 'completed',
            };
            return [noActivityItem];
        }
        return sorted;
    }, [transfers, tips, gifts, invoices, blockchainTxs, walletAddress, email, profile]);

    return { activities };
}
