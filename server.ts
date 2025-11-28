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
app.use('/api/web', webRouter);
app.use('/api/cron/process-expiry', processExpiryHandler);
app.use('/api/cron/send-reminders', sendRemindersHandler);
app.use('/api/international/quotes', internationalQuotesHandler);
app.use('/api/international/transfers', internationalTransfersHandler);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Oweza API',
    version: '1.0.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MetaSend API server running on port ${PORT}`);
});

export default app;
