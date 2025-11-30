import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const TIPS_KEY = '@oweza:tips';
const TIP_LINKS_KEY = '@oweza:tip_links';

export interface Tip {
  id: string;
  fromEmail: string;
  fromWallet: string;
  toEmail?: string;
  toWallet?: string;
  amount: number;
  currency: string;
  message?: string;
  tipLinkId?: string;
  status: 'pending' | 'completed' | 'expired';
  createdAt: string;
  completedAt?: string;
  txHash?: string;
}

export interface TipLink {
  id: string;
  creatorEmail: string;
  creatorWallet: string;
  displayName: string;
  description?: string;
  suggestedAmounts: number[];
  currency: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  totalReceived: number;
  tipCount: number;
}

/**
 * Create a new tip link for receiving tips
 */
export async function createTipLink(
  creatorEmail: string,
  creatorWallet: string,
  displayName: string,
  description?: string,
  suggestedAmounts: number[] = [1, 5, 10, 20],
  currency: string = 'cUSD'
): Promise<TipLink> {
  const tipLink: TipLink = {
    id: uuidv4(),
    creatorEmail,
    creatorWallet,
    displayName,
    description,
    suggestedAmounts,
    currency,
    isActive: true,
    createdAt: new Date().toISOString(),
    totalReceived: 0,
    tipCount: 0,
  };

  const links = await getTipLinks();
  links.push(tipLink);
  await AsyncStorage.setItem(TIP_LINKS_KEY, JSON.stringify(links));

  return tipLink;
}

/**
 * Get all tip links for a user
 */
export async function getTipLinks(creatorWallet?: string): Promise<TipLink[]> {
  const data = await AsyncStorage.getItem(TIP_LINKS_KEY);
  const links: TipLink[] = data ? JSON.parse(data) : [];

  if (creatorWallet) {
    return links.filter(link => link.creatorWallet === creatorWallet);
  }

  return links;
}

/**
 * Get a specific tip link by ID
 */
export async function getTipLink(id: string): Promise<TipLink | null> {
  const links = await getTipLinks();
  return links.find(link => link.id === id) || null;
}

/**
 * Send a tip via email
 */
export async function sendTipByEmail(
  fromEmail: string,
  fromWallet: string,
  toEmail: string,
  amount: number,
  currency: string,
  message?: string
): Promise<Tip> {
  const tip: Tip = {
    id: uuidv4(),
    fromEmail,
    fromWallet,
    toEmail,
    amount,
    currency,
    message,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const tips = await getTips();
  tips.push(tip);
  await AsyncStorage.setItem(TIPS_KEY, JSON.stringify(tips));

  // TODO: Send email notification

  return tip;
}

/**
 * Send a tip via tip link
 */
export async function sendTipViaLink(
  tipLinkId: string,
  fromEmail: string,
  fromWallet: string,
  amount: number,
  message?: string
): Promise<Tip> {
  const tipLink = await getTipLink(tipLinkId);
  if (!tipLink) {
    throw new Error('Tip link not found');
  }

  const tip: Tip = {
    id: uuidv4(),
    fromEmail,
    fromWallet,
    toWallet: tipLink.creatorWallet,
    amount,
    currency: tipLink.currency,
    message,
    tipLinkId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const tips = await getTips();
  tips.push(tip);
  await AsyncStorage.setItem(TIPS_KEY, JSON.stringify(tips));

  // Update tip link stats
  tipLink.totalReceived += amount;
  tipLink.tipCount += 1;
  await updateTipLink(tipLink);

  // TODO: Process blockchain transaction

  return tip;
}

/**
 * Get all tips for a user
 */
export async function getTips(walletAddress?: string, email?: string): Promise<Tip[]> {
  const data = await AsyncStorage.getItem(TIPS_KEY);
  const tips: Tip[] = data ? JSON.parse(data) : [];

  if (walletAddress || email) {
    return tips.filter(tip => {
      const walletMatch = walletAddress && (
        (tip.fromWallet && tip.fromWallet.toLowerCase() === walletAddress.toLowerCase()) ||
        (tip.toWallet && tip.toWallet.toLowerCase() === walletAddress.toLowerCase())
      );

      const emailMatch = email && (
        tip.fromEmail === email ||
        tip.toEmail === email
      );

      return walletMatch || emailMatch;
    });
  }

  return tips;
}

/**
 * Update tip link
 */
async function updateTipLink(tipLink: TipLink): Promise<void> {
  const links = await getTipLinks();
  const index = links.findIndex(l => l.id === tipLink.id);
  if (index !== -1) {
    links[index] = tipLink;
    await AsyncStorage.setItem(TIP_LINKS_KEY, JSON.stringify(links));
  }
}

/**
 * Toggle tip link active status
 */
export async function toggleTipLinkStatus(id: string): Promise<TipLink | null> {
  const tipLink = await getTipLink(id);
  if (!tipLink) return null;

  tipLink.isActive = !tipLink.isActive;
  await updateTipLink(tipLink);

  return tipLink;
}

/**
 * Delete tip link
 */
export async function deleteTipLink(id: string): Promise<void> {
  const links = await getTipLinks();
  const filtered = links.filter(link => link.id !== id);
  await AsyncStorage.setItem(TIP_LINKS_KEY, JSON.stringify(filtered));
}

/**
 * Get tip link URL
 */
export function getTipLinkUrl(tipLinkId: string): string {
  // TODO: Use actual app URL from config
  return `https://oweza.io/tip/${tipLinkId}`;
}
