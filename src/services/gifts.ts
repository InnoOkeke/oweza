import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const GIFTS_KEY = '@metasend:gifts';

export type GiftTheme = 
  | 'birthday'
  | 'christmas'
  | 'new-year'
  | 'valentine'
  | 'graduation'
  | 'wedding'
  | 'thank-you'
  | 'red-envelope'
  | 'custom';

export interface CryptoGift {
  id: string;
  fromEmail: string;
  fromWallet: string;
  fromName: string;
  toEmail?: string;
  toWallet?: string;
  toName?: string;
  amount: number;
  currency: string;
  theme: GiftTheme;
  message: string;
  claimCode?: string;
  isPublicLink: boolean;
  expiresAt?: string;
  status: 'pending' | 'claimed' | 'expired' | 'refunded';
  createdAt: string;
  claimedAt?: string;
  claimedBy?: string;
  txHash?: string;
}

const GIFT_THEMES = {
  birthday: {
    emoji: '🎂',
    color: '#FF6B9D',
    title: 'Happy Birthday!',
    defaultMessage: 'Wishing you a wonderful birthday! 🎉',
  },
  christmas: {
    emoji: '🎄',
    color: '#228B22',
    title: 'Merry Christmas!',
    defaultMessage: 'Season\'s greetings and best wishes! 🎅',
  },
  'new-year': {
    emoji: '🎊',
    color: '#FFD700',
    title: 'Happy New Year!',
    defaultMessage: 'Wishing you prosperity in the new year! 🎆',
  },
  valentine: {
    emoji: '💝',
    color: '#FF1493',
    title: 'Happy Valentine\'s Day!',
    defaultMessage: 'Sending love your way! 💕',
  },
  graduation: {
    emoji: '🎓',
    color: '#4169E1',
    title: 'Congratulations Graduate!',
    defaultMessage: 'Congratulations on your achievement! 🎉',
  },
  wedding: {
    emoji: '💍',
    color: '#F0E68C',
    title: 'Congratulations!',
    defaultMessage: 'Best wishes on your special day! 💑',
  },
  'thank-you': {
    emoji: '🙏',
    color: '#9370DB',
    title: 'Thank You!',
    defaultMessage: 'Thanks for everything! 🌟',
  },
  'red-envelope': {
    emoji: '🧧',
    color: '#DC143C',
    title: 'Red Envelope',
    defaultMessage: 'Best wishes and good fortune! 🎊',
  },
  custom: {
    emoji: '🎁',
    color: '#4A90E2',
    title: 'Crypto Gift',
    defaultMessage: 'A gift for you!',
  },
};

/**
 * Get theme details
 */
export function getGiftTheme(theme: GiftTheme) {
  return GIFT_THEMES[theme];
}

/**
 * Generate claim code
 */
function generateClaimCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create crypto gift
 */
export async function createCryptoGift(
  fromEmail: string,
  fromWallet: string,
  fromName: string,
  amount: number,
  currency: string,
  theme: GiftTheme,
  message: string,
  options?: {
    toEmail?: string;
    toName?: string;
    expiresAt?: string;
    isPublicLink?: boolean;
  }
): Promise<CryptoGift> {
  const gift: CryptoGift = {
    id: uuidv4(),
    fromEmail,
    fromWallet,
    fromName,
    toEmail: options?.toEmail,
    toName: options?.toName,
    amount,
    currency,
    theme,
    message,
    claimCode: options?.isPublicLink ? generateClaimCode() : undefined,
    isPublicLink: options?.isPublicLink || false,
    expiresAt: options?.expiresAt,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const gifts = await getCryptoGifts();
  gifts.push(gift);
  await AsyncStorage.setItem(GIFTS_KEY, JSON.stringify(gifts));

  // TODO: Send email notification if toEmail provided
  // TODO: Lock funds in escrow

  return gift;
}

/**
 * Get crypto gifts
 */
export async function getCryptoGifts(
  walletOrEmail?: string,
  status?: CryptoGift['status']
): Promise<CryptoGift[]> {
  const data = await AsyncStorage.getItem(GIFTS_KEY);
  let gifts: CryptoGift[] = data ? JSON.parse(data) : [];

  if (walletOrEmail) {
    gifts = gifts.filter(
      gift => 
        gift.fromEmail === walletOrEmail || 
        gift.fromWallet === walletOrEmail ||
        gift.toEmail === walletOrEmail ||
        gift.toWallet === walletOrEmail
    );
  }

  if (status) {
    gifts = gifts.filter(gift => gift.status === status);
  }

  return gifts.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get gift by ID or claim code
 */
export async function getCryptoGift(
  idOrCode: string
): Promise<CryptoGift | null> {
  const gifts = await getCryptoGifts();
  return gifts.find(
    gift => gift.id === idOrCode || gift.claimCode === idOrCode
  ) || null;
}

/**
 * Claim crypto gift
 */
export async function claimCryptoGift(
  idOrCode: string,
  claimerWallet: string,
  claimerEmail?: string
): Promise<CryptoGift | null> {
  const gifts = await getCryptoGifts();
  const gift = gifts.find(
    g => (g.id === idOrCode || g.claimCode === idOrCode) && g.status === 'pending'
  );
  
  if (!gift) return null;

  // Check if expired
  if (gift.expiresAt && new Date(gift.expiresAt) < new Date()) {
    gift.status = 'expired';
    await AsyncStorage.setItem(GIFTS_KEY, JSON.stringify(gifts));
    return gift;
  }

  gift.status = 'claimed';
  gift.claimedAt = new Date().toISOString();
  gift.claimedBy = claimerEmail || claimerWallet;
  gift.toWallet = claimerWallet;

  await AsyncStorage.setItem(GIFTS_KEY, JSON.stringify(gifts));

  // TODO: Transfer funds from escrow to claimer

  return gift;
}

/**
 * Get gift URL
 */
export function getGiftUrl(giftId: string, claimCode?: string): string {
  const base = `https://metasend.io/gift/${giftId}`;
  return claimCode ? `${base}?code=${claimCode}` : base;
}

/**
 * Get all gift themes
 */
export function getAllGiftThemes() {
  return Object.entries(GIFT_THEMES).map(([key, value]) => ({
    id: key as GiftTheme,
    ...value,
  }));
}
