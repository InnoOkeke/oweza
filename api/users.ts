import { Request, Response, Router } from 'express';
import { getDatabase } from '../src/services/database';
import { User } from '../src/types/database';

const router = Router();
const authorize = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.METASEND_API_KEY}`;
};

const badRequest = (res: Response, message: string) => res.status(400).json({ success: false, error: message });

router.get('/', async (req: Request, res: Response) => {
  // Health check endpoint (no auth required)
  if (req.url?.includes('health')) {
    return res.status(200).json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      mongoConfigured: Boolean(process.env.MONGODB_URI)
    });
  }
  if (!authorize(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    // Check if MongoDB is configured
    if (!process.env.MONGODB_URI) {
      return res.status(500).json({ success: false, error: 'Database not configured' });
    }
    const dbPromise = getDatabase();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timeout')), 8000));
    const db = await Promise.race([dbPromise, timeoutPromise]) as Awaited<ReturnType<typeof getDatabase>>;

    const { email, userId, walletAddress, search, limit } = req.query;

    if (search && typeof search === 'string') {
      const users = await db.searchUsersByEmail(search, limit ? Number(limit) : 10);
      return res.status(200).json({ success: true, users });
    }

    if (email && typeof email === 'string') {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await db.getUserByEmail(normalizedEmail);
      return res.status(200).json({ success: true, user });
    }

    if (userId && typeof userId === 'string') {
      const user = await db.getUserById(userId);
      return res.status(200).json({ success: true, user });
    }

    if (walletAddress && typeof walletAddress === 'string') {
      const user = await db.getUserByWalletAddress(walletAddress);
      return res.status(200).json({ success: true, user });
    }

    return badRequest(res, 'Provide email, userId, walletAddress, or search query');
  } catch (err) {
    console.error('Users GET error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  if (!authorize(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    if (!process.env.MONGODB_URI) return res.status(500).json({ success: false, error: 'Database not configured' });
    const dbPromise = getDatabase();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timeout')), 8000));
    const db = (await Promise.race([dbPromise, timeoutPromise])) as Awaited<ReturnType<typeof getDatabase>>;

    const { userId, email, emailVerified, walletAddress, displayName, avatar } = req.body as Partial<User> & { walletAddress?: string; displayName?: string; avatar?: string };
    if (!userId || !email) return badRequest(res, 'userId and email are required');

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.getUserByEmail(normalizedEmail);
    const now = new Date().toISOString();

    if (existing) {
      const updated = await db.updateUser(existing.userId, {
        emailVerified: emailVerified ?? existing.emailVerified,
        wallets: {
          ...existing.wallets,
          celo: walletAddress ?? existing.wallets?.celo,
        },
        profile: {
          ...existing.profile,
          displayName: displayName ?? existing.profile?.displayName,
          avatar: avatar ?? existing.profile?.avatar,
        },
        lastLoginAt: now,
      });

      return res.status(200).json({ success: true, user: updated });
    }

    const user: User = {
      userId,
      email: normalizedEmail,
      emailVerified: emailVerified ?? true,
      wallets: {
        celo: walletAddress,
      },
      profile: {
        displayName,
        avatar,
      },
      createdAt: now,
      lastLoginAt: now,
    };

    await db.createUser(user);
    return res.status(201).json({ success: true, user });
  } catch (err) {
    console.error('Users POST error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.patch('/', async (req: Request, res: Response) => {
  if (!authorize(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    if (!process.env.MONGODB_URI) return res.status(500).json({ success: false, error: 'Database not configured' });
    const dbPromise = getDatabase();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timeout')), 8000));
    const db = (await Promise.race([dbPromise, timeoutPromise])) as Awaited<ReturnType<typeof getDatabase>>;

    const { userId, updates } = req.body as { userId?: string; updates?: Partial<User> };
    if (!userId || !updates) return badRequest(res, 'userId and updates are required');

    const updated = await db.updateUser(userId, updates);
    return res.status(200).json({ success: true, user: updated });
  } catch (err) {
    console.error('Users PATCH error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
