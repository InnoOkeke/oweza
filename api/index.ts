import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MetaSend - Send USDC via Email</title>
      <meta name="description" content="Send and receive USDC cryptocurrency via email addresses. No wallet required.">
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
          max-width: 600px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          text-align: center;
        }
        .logo { font-size: 48px; margin-bottom: 20px; }
        h1 { font-size: 36px; color: #1a202c; margin-bottom: 20px; }
        .subtitle { font-size: 18px; color: #4a5568; margin-bottom: 30px; line-height: 1.6; }
        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin: 30px 0;
          text-align: left;
        }
        .feature {
          padding: 20px;
          background: #f7fafc;
          border-radius: 12px;
        }
        .feature-icon { font-size: 32px; margin-bottom: 10px; }
        .feature-title { font-weight: 600; color: #1a202c; margin-bottom: 10px; }
        .feature-desc { color: #4a5568; font-size: 14px; line-height: 1.5; }
        .download-section { margin-top: 40px; }
        .download-title { font-size: 24px; color: #1a202c; margin-bottom: 20px; }
        .app-links {
          display: flex;
          justify-content: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .app-link {
          display: inline-block;
          background: #000;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          transition: background 0.3s;
        }
        .app-link:hover { background: #333; }
        .footer { margin-top: 40px; color: #718096; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">📱💰</div>
        <h1>MetaSend</h1>
        <p class="subtitle">Send and receive USDC cryptocurrency via email addresses. No wallet required for recipients.</p>

        <div class="features">
          <div class="feature">
            <div class="feature-icon">📧</div>
            <div class="feature-title">Email-Based Transfers</div>
            <div class="feature-desc">Send USDC to anyone with just their email address. Recipients get notified and can claim funds instantly.</div>
          </div>
          <div class="feature">
            <div class="feature-icon">🔒</div>
            <div class="feature-title">Secure & Gasless</div>
            <div class="feature-desc">Built on Coinbase Smart Wallet with gasless transactions. Your funds are protected by escrow until claimed.</div>
          </div>
          <div class="feature">
            <div class="feature-icon">🌍</div>
            <div class="feature-title">Multi-Chain Support</div>
            <div class="feature-desc">Send across Base, Solana, and Tron networks. International transfers with competitive rates.</div>
          </div>
        </div>

        <div class="download-section">
          <h2 class="download-title">Get Started</h2>
          <div class="app-links">
            <a href="https://apps.apple.com" class="app-link">📱 App Store</a>
            <a href="https://play.google.com" class="app-link">🤖 Google Play</a>
          </div>
        </div>

        <div class="footer">
          <p>© 2024 MetaSend. Send crypto, simply.</p>
        </div>
      </div>
    </body>
    </html>
  `);
}