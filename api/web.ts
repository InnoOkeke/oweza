/**
 * Unified web handler for all shareable links
 * Handles claim, payment, tips, invoices, and gifts
 */

import { Request, Response, Router } from "express";
import mongoDb from "../src/services/mongoDatabase";

const GIFT_THEMES: Record<string, { emoji: string; background: string; primary: string; accent: string }> = {
  birthday: { emoji: "🎂", background: "#FEF3C7", primary: "#F59E0B", accent: "#B45309" },
  anniversary: { emoji: "💝", background: "#FCE7F3", primary: "#EC4899", accent: "#BE185D" },
  holiday: { emoji: "🎄", background: "#D1FAE5", primary: "#10B981", accent: "#047857" },
  thank_you: { emoji: "🙏", background: "#E0E7FF", primary: "#6366F1", accent: "#4338CA" },
  congratulations: { emoji: "🎉", background: "#DBEAFE", primary: "#3B82F6", accent: "#1D4ED8" },
  red_envelope: { emoji: "🧧", background: "#FEE2E2", primary: "#DC2626", accent: "#B91C1C" },
  custom: { emoji: "🎁", background: "#F3E8FF", primary: "#A855F7", accent: "#7C3AED" },
};


const router = Router();

router.get("/claim/:transferId", async (req: Request, res: Response) => {
  const transferId = req.params.transferId;
  await handleClaim(transferId, res);
});

router.get("/pay/:requestId", async (req: Request, res: Response) => {
  const requestId = req.params.requestId;
  await handlePayment(requestId, res);
});

router.get("/gift/:giftId", async (req: Request, res: Response) => {
  const giftId = req.params.giftId;
  await handleGift(giftId, res);
});

router.get("/tip/:jarId", async (req: Request, res: Response) => {
  const jarId = req.params.jarId;
  await handleTip(jarId, res);
});

router.use((req, res) => {
  res.status(404).send(getErrorPage("Page not found"));
});

export default router;

async function handleClaim(transferId: string, res: Response) {
  if (!transferId) {
    return res.status(400).send(getErrorPage("Invalid claim link"));
  }

  try {
    let transfer: any = await mongoDb.getPendingTransferById(transferId);

    // If no transfer found, check if it's a gift ID
    if (!transfer) {
      const gift = await mongoDb.getGiftById(transferId);
      if (gift) {
        // Treat gift as a transfer for claim UI
        if (gift.status === "claimed") {
          return res.status(200).send(getInfoPage("Gift already claimed", "Looks like this gift has already been claimed. 🎉"));
        }
        if (gift.status === "cancelled") {
          return res.status(400).send(getErrorPage("This gift was cancelled by the sender"));
        }
        if (gift.status === "expired") {
          return res.status(400).send(getErrorPage("This gift has expired"));
        }
        // Map gift to transfer format for claim page (typed as 'any' for flexibility)
        transfer = {
          amount: gift.amount,
          token: gift.token,
          senderName: gift.senderName,
          senderEmail: gift.senderEmail,
          recipientEmail: gift.recipientEmail,
          status: gift.status,
          expiresAt: gift.expiresAt,
          message: gift.message,
        };
      } else {
        return res.status(404).send(getErrorPage("Transfer not found"));
      }
    }

    if (transfer.status !== "pending") {
      return res.status(400).send(getErrorPage(`This transfer has already been ${transfer.status}`));
    }

    if (new Date(transfer.expiresAt) < new Date()) {
      return res.status(400).send(getErrorPage("This transfer has expired"));
    }

    const deepLink = `metasend://claim/${transferId}`;
    return res.status(200).send(getClaimPage(transfer, deepLink));
  } catch (error) {
    console.error("Claim error:", error);
    return res.status(500).send(getErrorPage("Internal server error"));
  }
}

async function handlePayment(requestId: string, res: Response) {
  if (!requestId) {
    return res.status(400).send(getErrorPage("Invalid payment request link"));
  }

  try {
    const request = await mongoDb.getPaymentRequestById(requestId);

    if (!request) {
      return res.status(404).send(getErrorPage("Payment request not found"));
    }

    if (request.status === "paid") {
      return res.status(200).send(getPaidPage());
    }

    if (request.status === "cancelled") {
      return res.status(400).send(getErrorPage("This payment request has been cancelled"));
    }

    const deepLink = `metasend://pay/${requestId}`;
    return res.status(200).send(getPaymentPage(request, deepLink));
  } catch (error) {
    console.error("Payment error:", error);
    return res.status(500).send(getErrorPage("Internal server error"));
  }
}

async function handleGift(giftId: string, res: Response) {
  if (!giftId) {
    return res.status(400).send(getErrorPage("Invalid gift link"));
  }

  try {
    const gift = await mongoDb.getGiftById(giftId);

    if (!gift) {
      return res.status(404).send(getErrorPage("Gift not found"));
    }

    if (gift.status === "claimed") {
      return res.status(200).send(getInfoPage("Gift already claimed", "Looks like this gift has already been claimed. 🎉"));
    }

    if (gift.status === "cancelled") {
      return res.status(400).send(getErrorPage("This gift was cancelled by the sender"));
    }

    if (gift.status === "expired") {
      return res.status(400).send(getErrorPage("This gift has expired"));
    }

    const theme = GIFT_THEMES[gift.theme] || GIFT_THEMES.custom;
    // Use claim deep link so the app opens ClaimScreen directly
    const deepLink = `metasend://claim/${giftId}`;
    return res.status(200).send(getGiftPage(gift, deepLink, theme));
  } catch (error) {
    console.error("Gift error:", error);
    return res.status(500).send(getErrorPage("Internal server error"));
  }
}

async function handleTip(jarId: string, res: Response) {
  if (!jarId) {
    return res.status(400).send(getErrorPage("Invalid tip jar link"));
  }

  try {
    const jar = await mongoDb.getTipJarById(jarId);

    if (!jar) {
      return res.status(404).send(getErrorPage("Tip jar not found"));
    }

    if (jar.status === "closed") {
      return res.status(400).send(getErrorPage("This tip jar is no longer accepting tips"));
    }

    const deepLink = `metasend://tip/${jarId}`;
    return res.status(200).send(getTipPage(jar, deepLink));
  } catch (error) {
    console.error("Tip error:", error);
    return res.status(500).send(getErrorPage("Internal server error"));
  }
}

function getClaimPage(transfer: any, deepLink: string) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Claim ${transfer.amount} ${transfer.token} - MetaSend</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          text-align: center;
        }
        .icon { font-size: 64px; margin-bottom: 20px; }
        h1 { font-size: 32px; color: #1a202c; margin-bottom: 10px; }
        .amount { font-size: 48px; font-weight: bold; color: #667eea; margin: 20px 0; }
        .sender { font-size: 18px; color: #4a5568; margin-bottom: 30px; }
        .message {
          background: #f7fafc;
          padding: 20px;
          border-radius: 12px;
          margin: 20px 0;
          color: #2d3748;
          font-style: italic;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 16px 40px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 600;
          font-size: 18px;
          margin: 10px 5px;
          transition: transform 0.2s;
          width: 100%;
          max-width: 350px;
        }
        .button:hover { transform: translateY(-2px); }
        .button.store {
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .button.store:hover { background: #333; }
        .hidden { display: none !important; }
        .info { margin-top: 30px; padding-top: 30px; border-top: 1px solid #e2e8f0; }
        .steps { text-align: left; color: #4a5568; line-height: 1.8; }
        .steps li { margin-bottom: 10px; }
        .expires { margin-top: 20px; color: #e53e3e; font-size: 14px; font-weight: 600; }
        .footer { margin-top: 30px; color: #718096; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">💰</div>
        <h1>You've Got Money!</h1>
        <div class="amount">${transfer.amount} ${transfer.token}</div>
        <div class="sender">from ${transfer.senderName || transfer.senderEmail}</div>
        ${transfer.message ? `<div class="message">"${transfer.message}"</div>` : ''}
        
        <a href="metasend://claim/${transfer.transferId}" class="button" id="openAppBtn">
          Open MetaSend App
        </a>
        <a href="https://apps.apple.com/app/metasend" class="button store hidden" id="appStoreBtn">
          <span>📱</span>
          <span>Download on App Store</span>
        </a>
        <a href="https://play.google.com/store/apps/details?id=com.kellonapp.metasend" class="button store hidden" id="playStoreBtn">
          <span>🤖</span>
          <span>Get it on Google Play</span>
        </a>

        <div class="info">
          <div style="font-weight: 600; margin-bottom: 15px;">How to claim:</div>
          <ol class="steps">
            <li>Download MetaSend if you don't have it yet</li>
            <li>Sign in with <strong>${transfer.recipientEmail}</strong></li>
            <li>Your funds will appear automatically in your wallet</li>
          </ol>
        </div>
        <div class="expires">⏰ Expires: ${new Date(transfer.expiresAt).toLocaleDateString()}</div>
        <div class="footer">Powered by <strong>MetaSend</strong></div>
      </div>

      <script>
        // Detect device
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        const isAndroid = /android/i.test(ua);
        
        const openBtn = document.getElementById('openAppBtn');
        const appStoreBtn = document.getElementById('appStoreBtn');
        const playStoreBtn = document.getElementById('playStoreBtn');

        // Show appropriate store button
        if (isIOS) {
          appStoreBtn.classList.remove('hidden');
        } else if (isAndroid) {
          playStoreBtn.classList.remove('hidden');
        }

        // Try to open app with fallback
        openBtn.addEventListener('click', function(e) {
          e.preventDefault();
          const deepLink = this.href;
          
          // Try to open app
          window.location.href = deepLink;
          
          // Fallback if app doesn't open
          setTimeout(function() {
            if (document.hidden) return; // App opened successfully
            
            if (isIOS && confirm('MetaSend app not installed. Download from App Store?')) {
              window.location.href = appStoreBtn.href;
            } else if (isAndroid && confirm('MetaSend app not installed. Download from Google Play?')) {
              window.location.href = playStoreBtn.href;
            } else if (!isIOS && !isAndroid) {
              alert('Please download MetaSend from your device\\'s app store to claim your funds.');
            }
          }, 2000);
        });
      </script>
    </body>
    </html>
  `;
}

function getPaymentPage(request: any, deepLink: string) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pay ${request.amount} ${request.token} - MetaSend</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #3A80F7 0%, #8B5CF6 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          text-align: center;
        }
        .icon { font-size: 64px; margin-bottom: 20px; }
        h1 { font-size: 28px; color: #1a202c; margin-bottom: 10px; }
        .amount { font-size: 48px; font-weight: bold; color: #3A80F7; margin: 20px 0; }
        .from { font-size: 18px; color: #4a5568; margin-bottom: 20px; }
        .description {
          background: #f7fafc;
          padding: 20px;
          border-radius: 12px;
          margin: 20px 0;
          color: #2d3748;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #3A80F7 0%, #8B5CF6 100%);
          color: white;
          padding: 16px 40px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 600;
          font-size: 18px;
          margin: 10px 5px;
          transition: transform 0.2s;
          width: 100%;
          max-width: 350px;
        }
        .button:hover { transform: translateY(-2px); }
        .button.store {
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .button.store:hover { background: #333; }
        .hidden { display: none !important; }
        .footer { margin-top: 30px; color: #718096; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">💳</div>
        <h1>Payment Request</h1>
        <div class="amount">${request.amount} ${request.token}</div>
        <div class="from">from ${request.creatorName || request.creatorEmail}</div>
        <div class="description"><strong>Description:</strong><br>${request.description}</div>
        
        <a href="${deepLink}" class="button" id="openAppBtn">Pay with MetaSend</a>
        <a href="https://apps.apple.com/app/metasend" class="button store hidden" id="appStoreBtn">
          <span>📱</span>
          <span>Download on App Store</span>
        </a>
        <a href="https://play.google.com/store/apps/details?id=com.kellonapp.metasend" class="button store hidden" id="playStoreBtn">
          <span>🤖</span>
          <span>Get it on Google Play</span>
        </a>

        <div class="footer">Powered by <strong>MetaSend</strong></div>
      </div>

      <script>
        // Detect device
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        const isAndroid = /android/i.test(ua);
        
        const openBtn = document.getElementById('openAppBtn');
        const appStoreBtn = document.getElementById('appStoreBtn');
        const playStoreBtn = document.getElementById('playStoreBtn');

        // Show appropriate store button
        if (isIOS) {
          appStoreBtn.classList.remove('hidden');
        } else if (isAndroid) {
          playStoreBtn.classList.remove('hidden');
        }

        // Try to open app with fallback
        openBtn.addEventListener('click', function(e) {
          e.preventDefault();
          const deepLink = this.href;
          
          // Try to open app
          window.location.href = deepLink;
          
          // Fallback if app doesn't open
          setTimeout(function() {
            if (document.hidden) return; // App opened successfully
            
            if (isIOS && confirm('MetaSend app not installed. Download from App Store?')) {
              window.location.href = appStoreBtn.href;
            } else if (isAndroid && confirm('MetaSend app not installed. Download from Google Play?')) {
              window.location.href = playStoreBtn.href;
            } else if (!isIOS && !isAndroid) {
              alert('Please download MetaSend from your device\\'s app store to pay.');
            }
          }, 2000);
        });
      </script>
    </body>
    </html>
  `;
}

function getTipPage(jar: any, deepLink: string) {
  const socialLinks = jar.socialLinks || {};
  const hasSocials = Object.values(socialLinks).some(link => !!link);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${jar.title} - MetaSend</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #F59E0B 0%, #EF4444 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          text-align: center;
        }
        .avatar {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: #f3f4f6;
          margin: 0 auto 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
          border: 4px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        h1 { font-size: 28px; color: #1a202c; margin-bottom: 5px; }
        .username { font-size: 16px; color: #6b7280; margin-bottom: 20px; }
        .description { 
          background: #f7fafc; 
          padding: 20px; 
          border-radius: 12px; 
          margin: 20px 0; 
          color: #2d3748;
          line-height: 1.6;
        }
        .stats {
          display: flex;
          justify-content: space-around;
          margin: 20px 0;
          padding: 20px;
          background: #fff7ed;
          border-radius: 12px;
          border: 1px solid #ffedd5;
        }
        .stat-value { font-size: 24px; font-weight: bold; color: #F59E0B; }
        .stat-label { font-size: 14px; color: #718096; margin-top: 5px; }
        
        .social-links {
          display: flex;
          justify-content: center;
          gap: 15px;
          margin: 20px 0;
        }
        .social-link {
          color: #4b5563;
          text-decoration: none;
          font-size: 20px;
          transition: color 0.2s;
        }
        .social-link:hover { color: #F59E0B; }

        .button {
          display: inline-block;
          background: linear-gradient(135deg, #F59E0B 0%, #EF4444 100%);
          color: white;
          padding: 16px 40px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 600;
          font-size: 18px;
          margin: 10px 5px;
          width: 100%;
          max-width: 350px;
          transition: transform 0.2s;
        }
        .button:hover { transform: translateY(-2px); }
        .button.store {
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .button.store:hover { background: #333; }
        .hidden { display: none !important; }
        .footer { margin-top: 30px; color: #9ca3af; font-size: 14px; }
        
        .qr-placeholder {
          margin: 20px auto;
          padding: 20px;
          background: white;
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
          color: #64748b;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="avatar">
          ${jar.creatorAvatar ? `<img src="${jar.creatorAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : '👤'}
        </div>
        
        <h1>${jar.title}</h1>
        <div class="username">@${jar.username || jar.creatorName || 'user'}</div>
        
        ${jar.description ? `<div class="description">${jar.description}</div>` : ''}
        
        ${hasSocials ? `
          <div class="social-links">
            ${socialLinks.twitter ? `<a href="${socialLinks.twitter}" target="_blank" class="social-link">Twitter</a>` : ''}
            ${socialLinks.farcaster ? `<a href="${socialLinks.farcaster}" target="_blank" class="social-link">Farcaster</a>` : ''}
            ${socialLinks.instagram ? `<a href="${socialLinks.instagram}" target="_blank" class="social-link">Instagram</a>` : ''}
            ${socialLinks.website ? `<a href="${socialLinks.website}" target="_blank" class="social-link">Website</a>` : ''}
          </div>
        ` : ''}

        <div class="stats">
          <div><div class="stat-value">${jar.tipCount}</div><div class="stat-label">Supporters</div></div>
          <div><div class="stat-value">$${jar.totalTipsReceived.toFixed(2)}</div><div class="stat-label">Received</div></div>
        </div>

        <a href="${deepLink}" class="button" id="openAppBtn">Send a Tip 🎁</a>
        <a href="https://apps.apple.com/app/metasend" class="button store hidden" id="appStoreBtn">
          <span>📱</span>
          <span>Download on App Store</span>
        </a>
        <a href="https://play.google.com/store/apps/details?id=com.kellonapp.metasend" class="button store hidden" id="playStoreBtn">
          <span>🤖</span>
          <span>Get it on Google Play</span>
        </a>
        
        <div class="qr-placeholder">
          Open in MetaSend App to pay with Crypto, Card, or Bank Transfer
        </div>

        <div class="footer">Powered by <strong>MetaSend</strong></div>
      </div>

      <script>
        // Detect device
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        const isAndroid = /android/i.test(ua);
        
        const openBtn = document.getElementById('openAppBtn');
        const appStoreBtn = document.getElementById('appStoreBtn');
        const playStoreBtn = document.getElementById('playStoreBtn');

        // Show appropriate store button
        if (isIOS) {
          appStoreBtn.classList.remove('hidden');
        } else if (isAndroid) {
          playStoreBtn.classList.remove('hidden');
        }

        // Try to open app with fallback
        openBtn.addEventListener('click', function(e) {
          e.preventDefault();
          const deepLink = this.href;
          
          // Try to open app
          window.location.href = deepLink;
          
          // Fallback if app doesn't open
          setTimeout(function() {
            if (document.hidden) return; // App opened successfully
            
            if (isIOS && confirm('MetaSend app not installed. Download from App Store?')) {
              window.location.href = appStoreBtn.href;
            } else if (isAndroid && confirm('MetaSend app not installed. Download from Google Play?')) {
              window.location.href = playStoreBtn.href;
            } else if (!isIOS && !isAndroid) {
              alert('Please download MetaSend from your device\\'s app store to send a tip.');
            }
          }, 2000);
        });
      </script>
    </body>
    </html>
  `;
}

function getGiftPage(
  gift: any,
  deepLink: string,
  theme: { emoji: string; background: string; primary: string; accent: string }
) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${theme.emoji} Claim your gift - MetaSend</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: ${theme.background};
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 520px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          text-align: center;
          border: 4px solid ${theme.primary};
        }
        .emoji { font-size: 72px; margin-bottom: 20px; }
        h1 { font-size: 32px; color: #1a202c; margin-bottom: 10px; }
        .amount { font-size: 48px; font-weight: bold; color: ${theme.primary}; margin: 20px 0; }
        .sender { font-size: 18px; color: #4a5568; margin-bottom: 20px; }
        .message {
          background: ${theme.background};
          padding: 20px;
          border-radius: 12px;
          margin: 20px 0;
          color: #2d3748;
          border-left: 4px solid ${theme.primary};
          font-style: italic;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%);
          color: white;
          padding: 16px 40px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 600;
          font-size: 18px;
          margin: 10px 5px;
          transition: transform 0.2s;
          width: 100%;
          max-width: 350px;
        }
        .button:hover { transform: translateY(-2px); }
        .button.store {
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .button.store:hover { background: #333; }
        .hidden { display: none !important; }
        .footer { margin-top: 20px; color: #718096; font-size: 14px; }
        .note { margin-top: 10px; font-size: 13px; color: #4a5568; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">${theme.emoji}</div>
        <h1>${gift.recipientName ? `${gift.recipientName},` : ""} you have a gift!</h1>
        <div class="amount">${gift.amount} ${gift.token}</div>
        <div class="sender">from ${gift.senderName || gift.senderEmail}</div>
        ${gift.message ? `<div class="message">"${gift.message}"</div>` : ""}
        
        <a href="${deepLink}" class="button" id="openAppBtn">Open MetaSend App</a>
        <a href="https://apps.apple.com/app/metasend" class="button store hidden" id="appStoreBtn">
          <span>📱</span>
          <span>Download on App Store</span>
        </a>
        <a href="https://play.google.com/store/apps/details?id=com.kellonapp.metasend" class="button store hidden" id="playStoreBtn">
          <span>🤖</span>
          <span>Get it on Google Play</span>
        </a>

        <p class="note">Need the app? Download it to claim your gift.</p>
        <div class="footer">Powered by <strong>MetaSend</strong></div>
      </div>

      <script>
        // Detect device
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        const isAndroid = /android/i.test(ua);
        
        const openBtn = document.getElementById('openAppBtn');
        const appStoreBtn = document.getElementById('appStoreBtn');
        const playStoreBtn = document.getElementById('playStoreBtn');

        // Show appropriate store button
        if (isIOS) {
          appStoreBtn.classList.remove('hidden');
        } else if (isAndroid) {
          playStoreBtn.classList.remove('hidden');
        }

        // Try to open app with fallback
        openBtn.addEventListener('click', function(e) {
          e.preventDefault();
          const deepLink = this.href;
          
          // Try to open app
          window.location.href = deepLink;
          
          // Fallback if app doesn't open
          setTimeout(function() {
            if (document.hidden) return; // App opened successfully
            
            if (isIOS && confirm('MetaSend app not installed. Download from App Store?')) {
              window.location.href = appStoreBtn.href;
            } else if (isAndroid && confirm('MetaSend app not installed. Download from Google Play?')) {
              window.location.href = playStoreBtn.href;
            } else if (!isIOS && !isAndroid) {
              alert('Please download MetaSend from your device\\'s app store to claim your gift.');
            }
          }, 2000);
        });
      </script>
    </body>
    </html>
  `;
}

function getInfoPage(title: string, message: string, emoji = "ℹ️") {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - MetaSend</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .icon { font-size: 64px; margin-bottom: 20px; }
        h1 { font-size: 28px; color: #1a202c; margin-bottom: 10px; }
        p { color: #4a5568; font-size: 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${emoji}</div>
        <h1>${title}</h1>
        <p>${message}</p>
      </div>
    </body>
    </html>
  `;
}

function getPaidPage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Completed - MetaSend</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        .icon { font-size: 64px; margin-bottom: 20px; }
        h1 { font-size: 28px; color: #1a202c; margin-bottom: 20px; }
        p { color: #4a5568; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h1>Payment Completed!</h1>
        <p>This payment request has already been paid.</p>
      </div>
    </body>
    </html>
  `;
}

function getErrorPage(message: string) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Error - MetaSend</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        .icon { font-size: 64px; margin-bottom: 20px; }
        h1 { font-size: 28px; color: #1a202c; margin-bottom: 20px; }
        p { color: #4a5568; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">❌</div>
        <h1>Oops!</h1>
        <p>${message}</p>
      </div>
    </body>
    </html>
  `;
}
