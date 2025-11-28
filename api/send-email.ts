import { Request, Response, Router } from 'express';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const router = Router();
router.post('/', async (req: Request, res: Response) => {
  // Verify request is from your app (simple security check)
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.METASEND_API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { to, subject, html, from } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
    }

    const allowedDomains = (process.env.RESEND_ALLOWED_FROM_DOMAINS || 'kellon.xyz,resend.dev')
      .split(',')
      .map((domain: string) => domain.trim().toLowerCase())
      .filter(Boolean);
    const fallbackFrom = process.env.RESEND_FALLBACK_FROM || 'MetaSend <noreply@kellon.xyz>';
    const onboardingFrom = 'MetaSend <onboarding@resend.dev>';
    const extractEmail = (address: string) => {
      const match = address.match(/<([^>]+)>/);
      return (match?.[1] || address).trim().toLowerCase();
    };
    const isAllowed = (address?: string) => {
      if (!address) return false;
      const email = extractEmail(address);
      const domain = email.split('@')[1];
      return !!domain && allowedDomains.includes(domain);
    };
    const candidateFroms = [
      typeof from === 'string' && from.trim().length > 0 ? from.trim() : undefined,
      process.env.RESEND_FROM_EMAIL,
      fallbackFrom,
      onboardingFrom,
    ];
    const fromAddress = candidateFroms.find((candidate) => isAllowed(candidate)) || onboardingFrom;
    if (!isAllowed(fromAddress)) {
      console.warn('⚠️ Falling back to verified sender domain for Resend.');
    }

    const response = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    });

    return res.status(200).json({ success: true, messageId: (response as any)?.id, message: 'Email sent successfully' });
  } catch (error) {
    console.error('❌ Email send error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
