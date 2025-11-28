/**
 * Tipping API
 * Handles creating tip jars, sending tips, and retrieving tip data
 */

import { Request, Response, Router } from "express";
import { z } from "zod";
import mongoDb from "../src/services/mongoDatabase";
import { TipJar, Tip, TipJarStatus } from "../src/types/database";

const CreateTipJarSchema = z.object({
  creatorUserId: z.string(),
  creatorEmail: z.string().email(),
  creatorName: z.string().nullable().optional(),
  creatorAvatar: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  username: z.string().nullable().optional(), // Should be unique, but for now just optional in schema
  socialLinks: z.object({
    twitter: z.string().nullable().optional(),
    farcaster: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
  }).nullable().optional(),
  walletAddresses: z.object({
    evm: z.string().nullable().optional(),
    solana: z.string().nullable().optional(),
  }).nullable().optional(),
  suggestedAmounts: z.array(z.number()),
  acceptedTokens: z.array(
    z.object({
      token: z.string(),
      chain: z.enum(["celo"]),
    })
  ),
});

const SendTipSchema = z.object({
  jarId: z.string().optional(),
  recipientUserId: z.string().optional(),
  recipientEmail: z.string().optional(),
  recipientName: z.string().optional(),
  tipperUserId: z.string().optional(),
  tipperEmail: z.string().email().optional(),
  tipperName: z.string().optional(),
  isAnonymous: z.boolean(),
  amount: z.string(),
  token: z.string(),
  chain: z.enum(["celo"]),
  message: z.string().optional(),
  transactionHash: z.string(),
});

const router = Router();

// GET tip jars or tips
router.get('/', async (req: Request, res: Response) => {
  try {
    const { jarId, creatorUserId, tipperUserId, username, type } = req.query;
    if (username && typeof username === 'string') {
      const jar = await mongoDb.getTipJarByUsername(username);
      if (!jar) return res.status(404).json({ error: 'Tip jar not found' });
      return res.status(200).json(jar);
    }
    if (jarId && typeof jarId === 'string' && type !== 'tips') {
      const jar = await mongoDb.getTipJarById(jarId);
      if (!jar) return res.status(404).json({ error: 'Tip jar not found' });
      return res.status(200).json(jar);
    }
    if (jarId && typeof jarId === 'string' && type === 'tips') {
      const tips = await mongoDb.getTipsByJar(jarId);
      return res.status(200).json(tips);
    }
    if (creatorUserId && typeof creatorUserId === 'string') {
      const jars = await mongoDb.getTipJarsByCreator(creatorUserId);
      return res.status(200).json(jars);
    }
    if (tipperUserId && typeof tipperUserId === 'string') {
      const tips = await mongoDb.getTipsByTipper(tipperUserId);
      return res.status(200).json(tips);
    }
    return res.status(400).json({ error: 'Missing query parameters' });
  } catch (err) {
    console.error('Tips GET error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create jar or send tip (action query param)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { action } = req.query;
    if (action === 'create-jar') {
      const validation = CreateTipJarSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error.errors });
      const data = validation.data;

      const jarId = `jar_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const now = new Date().toISOString();

      const jar: any = {
        jarId,
        creatorUserId: data.creatorUserId,
        creatorEmail: data.creatorEmail.toLowerCase().trim(),
        creatorName: data.creatorName,
        creatorAvatar: data.creatorAvatar,
        title: data.title,
        description: data.description,
        username: data.username,
        socialLinks: data.socialLinks,
        walletAddresses: data.walletAddresses,
        suggestedAmounts: data.suggestedAmounts,
        acceptedTokens: data.acceptedTokens,
        status: 'active',
        totalTipsReceived: 0,
        tipCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      await mongoDb.createTipJar(jar);
      return res.status(201).json(jar);
    }

    if (action === 'send-tip') {
      console.log('[tips] send-tip request:', req.body);
      const validation = SendTipSchema.safeParse(req.body);
      if (!validation.success) {
        console.error('[tips] validation failed:', validation.error.errors);
        return res.status(400).json({ error: validation.error.errors });
      }
      const data = validation.data;

      let jarId = data.jarId;

      // If no jarId provided, try to find or create jar for recipient
      if (!jarId) {
        if (!data.recipientUserId || !data.recipientEmail) {
          console.error('[tips] missing recipientUserId or recipientEmail for auto-create');
          return res.status(400).json({ error: 'Either jarId or recipientUserId+recipientEmail must be provided' });
        }

        // Check if recipient has an active tip jar
        const existingJars = await mongoDb.getTipJarsByCreator(data.recipientUserId);
        const activeJar = existingJars.find(jar => jar.status === 'active');

        if (activeJar) {
          jarId = activeJar.jarId;
        } else {
          // Auto-create a default tip jar for the recipient
          const newJarId = `jar_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const now = new Date().toISOString();

          const newJar: any = {
            jarId: newJarId,
            creatorUserId: data.recipientUserId,
            creatorEmail: data.recipientEmail.toLowerCase().trim(),
            creatorName: data.recipientName,
            creatorAvatar: undefined,
            title: `${data.recipientName || data.recipientEmail}'s Tip Jar`,
            description: "Support my work with crypto tips!",
            suggestedAmounts: [1, 5, 10, 25],
            acceptedTokens: [{ token: "cUSD", chain: "celo" }],
            status: 'active',
            totalTipsReceived: 0,
            tipCount: 0,
            createdAt: now,
            updatedAt: now,
          };

          try {
            const result = await mongoDb.createTipJar(newJar);
            if (!result) {
              console.error('[tips] createTipJar returned falsy value:', result);
              return res.status(500).json({ error: 'Failed to create tip jar', details: 'createTipJar returned falsy value' });
            }
            console.log('[tips] tip jar created:', newJarId);
            jarId = newJarId;
          } catch (err) {
            const errorMsg = (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err);
            console.error('[tips] failed to create tip jar:', errorMsg);
            return res.status(500).json({ error: 'Failed to create tip jar', details: errorMsg });
          }
        }
      }

      // At this point, jarId should be defined
      if (!jarId) {
        console.error('[tips] failed to determine tip jar');
        return res.status(400).json({ error: 'Failed to determine tip jar' });
      }

      const jar = await mongoDb.getTipJarById(jarId);
      if (!jar) {
        console.error('[tips] tip jar not found after creation:', jarId);
        return res.status(404).json({ error: 'Tip jar not found' });
      }
      if (jar.status !== 'active') {
        console.error('[tips] tip jar not active:', jarId);
        return res.status(400).json({ error: 'Tip jar is not active' });
      }

      const tipId = `tip_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const now = new Date().toISOString();

      const tip: any = {
        tipId,
        jarId,
        tipperUserId: data.tipperUserId,
        tipperEmail: data.tipperEmail?.toLowerCase().trim(),
        tipperName: data.tipperName,
        isAnonymous: data.isAnonymous,
        amount: data.amount,
        token: data.token,
        chain: data.chain,
        message: data.message,
        transactionHash: data.transactionHash,
        createdAt: now,
      };

      try {
        await mongoDb.createTip(tip);
      } catch (err) {
        const errorMsg = (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err);
        console.error('[tips] failed to create tip:', errorMsg);
        return res.status(500).json({ error: 'Failed to create tip', details: errorMsg });
      }

      const amount = parseFloat(String(data.amount));
      try {
        await mongoDb.updateTipJar(jarId, {
          totalTipsReceived: (jar.totalTipsReceived || 0) + amount,
          tipCount: (jar.tipCount || 0) + 1,
          updatedAt: now,
        });
      } catch (err) {
        console.error('[tips] failed to update tip jar:', err);
        // Don't fail the request, just log
      }

      return res.status(201).json(tip);
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Tips POST error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH update tip jar status
router.patch('/', async (req: Request, res: Response) => {
  try {
    const { jarId, status } = req.query;
    if (!jarId || !status || typeof jarId !== 'string' || typeof status !== 'string') {
      return res.status(400).json({ error: 'Missing jarId or status' });
    }
    const validStatuses: TipJarStatus[] = ['active', 'paused', 'closed'];
    if (!validStatuses.includes(status as TipJarStatus)) return res.status(400).json({ error: 'Invalid status' });

    const updated = await mongoDb.updateTipJar(jarId, { status: status as TipJarStatus, updatedAt: new Date().toISOString() });
    if (!updated) return res.status(404).json({ error: 'Tip jar not found' });
    return res.status(200).json(updated);
  } catch (error) {
    console.error('Tips PATCH error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
