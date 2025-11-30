import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Import API handlers (Express routers)
import pendingTransfersHandler from './api/pending-transfers';
import giftsHandler from './api/gifts';
import healthHandler from './api/health';
import invoicesHandler from './api/invoices';
import sendEmailHandler from './api/send-email';
import tipsHandler from './api/tips';
import transfersHandler from './api/transfers';
import usersHandler from './api/users';
import processExpiryHandler from './api/cron/process-expiry';
import sendRemindersHandler from './api/cron/send-reminders';
import internationalQuotesHandler from './api/international/quotes';
import internationalTransfersHandler from './api/international/transfers';
import webRouter from './api/web';

// Mount API routes (all Express routers)
app.use('/api/pending-transfers', pendingTransfersHandler);
app.use('/api/gifts', giftsHandler);
app.use('/api/health', healthHandler);
app.use('/api/invoices', invoicesHandler);
app.use('/api/send-email', sendEmailHandler);
app.use('/api/tips', tipsHandler);
app.use('/api/transfers', transfersHandler);
app.use('/api/users', usersHandler);
app.use('/api/cron/process-expiry', processExpiryHandler);
app.use('/api/cron/send-reminders', sendRemindersHandler);
app.use('/api/international/quotes', internationalQuotesHandler);
app.use('/api/international/transfers', internationalTransfersHandler);

// Mount web pages at root level (gift, tip, invoice, claim pages)
app.use('/', webRouter);

// Serve static files from public directory
app.use(express.static('public'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Oweza API',
    version: '1.0.0',
    endpoints: {
      api: '/api',
      health: '/api/health',
      web: {
        gifts: '/gift/:giftId',
        invoices: '/invoice/:invoiceId',
        tips: '/tip/:jarId'
      }
    }
  });
});

// 404 handler for API routes only
app.use('/api', (_req, res, next) => {
  // Only handle if no other route matched
  if (!res.headersSent) {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
  } else {
    next();
  }
});

// 404 handler for everything else
app.use((_req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>404 - Oweza</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: system-ui; text-align: center; padding: 50px; background: #f5f5f5; }
        h1 { color: #333; }
        a { color: #0066cc; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>404 - Page Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <a href="/">Go to Home</a>
    </body>
    </html>
  `);
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Oweza API & Web server running on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`🌐 Web: http://localhost:${PORT}`);
});

export default app;
