# MetaSend API Endpoints

This folder contains serverless API endpoints for MetaSend, deployed on Vercel.

## Endpoints

### POST /api/send-email
Sends transactional emails using Resend.

**Authentication:** Bearer token (METASEND_API_KEY)

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Email Subject",
  "html": "<html>Email body</html>",
  "from": "MetaSend <support@metasend.io>" // optional
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "abc123",
  "message": "Email sent successfully"
}
```

### GET/POST /api/transfers
Persists and queries transfer history records for the mobile app.

**Authentication:** Bearer token (METASEND_API_KEY)

**GET Query Parameters:**
- `senderWallet` (optional) – filter by the sender's wallet address (0x...)
- `senderUserId` (optional) – filter by user id
- `limit` (optional) – max number of records to return (default 50)

**POST Body:**
```json
{
  "id": "tx_...",
  "createdAt": "2025-11-14T00:00:00.000Z",
  "senderWallet": "0xabc...",
  "intent": {
    "recipientEmail": "friend@example.com",
    "amountCusd": 12.5,
    "memo": "optional",
    "senderEmail": "you@example.com",
    "senderName": "You",
    "senderUserId": "user_123"
  },
  "status": "sent",
  "txHash": "0x123..."
}
```

**Responses:**
- GET: `{ "success": true, "transfers": [ ... ] }`
- POST: `{ "success": true, "transfer": { ... } }`

### POST /api/cron/process-expiry
Processes expired pending transfers (runs hourly via Vercel Cron).

**Authentication:** X-Cron-Secret header

### POST /api/cron/send-reminders
Sends reminder emails for pending transfers (runs every 6 hours via Vercel Cron).

**Authentication:** X-Cron-Secret header

## Environment Variables

Required in Vercel project settings:

- `RESEND_API_KEY` - Resend API key for sending emails
- `METASEND_API_KEY` - API key for authenticating requests from mobile app
- `CRON_SECRET` - Secret for authenticating cron job requests
- `SUPPORT_EMAIL` - From email address (must be verified in Resend)
- `MONGODB_URI` - MongoDB connection string
- `ESCROW_CONTRACT_ADDRESS` - Deployed shared escrow contract address (Celo Sepolia)
- `ESCROW_TREASURY_WALLET` - Wallet address that funds on-chain transfers
- `ESCROW_TOKEN_ADDRESS` - ERC-20 token contract (defaults to cUSD)
- `ESCROW_NETWORK` - `celo` or `celo-sepolia`
- `CELO_RPC_URL` - Celo RPC endpoint

## Deployment

Deploy to Vercel:
```bash
vercel --prod
```

The endpoints will be available at: `https://your-project.vercel.app/api/*`

## Security

- All endpoints require authentication
- Email sending endpoint uses Bearer token authentication
- Cron endpoints use X-Cron-Secret header
- API keys should never be committed to git
