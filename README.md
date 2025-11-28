# Oweza Mobile

Oweza is a mobile application that lets users send cUSD to any email address using Reown AppKit wallet integration on Celo. Transfers use Celo's native gasless transactions with cUSD as the fee currency, and recipients without an account receive an email invitation to claim their funds after onboarding.

## Features

- **Reown AppKit Authentication:** Secure wallet connection with WalletConnect v2
- **Email-Based Transfers:** Send cUSD to any email address, even non-registered users
- **Pending Transfer System:** 
   - Shared on-chain escrow contract for unregistered recipients
   - Gasless transactions via Celo's feeCurrency mechanism (pay gas in cUSD)
   - Auto-claim on signup and 7-day expiry with automatic refunds
   - Email notifications at every stage
- **Gasless Transactions:** Celo native gasless support using cUSD as fee currency
- **Celo Network:** Built on Celo Sepolia testnet with cUSD stablecoin
- **Contact Management:** Recent recipients, favorites, and search
- **On/Off-Ramp Integration:** Quick links for MoonPay, Transak, Paycrest, and more
- **Background Tasks:** Automated expiry checks and reminder emails

## Architecture

### Core Services

- **UserDirectoryService:** User lookup, registration, wallet resolution
- **EscrowService:** Shared escrow contract driver
- **PendingTransferService:** Create, claim, cancel, and expire pending transfers
- **UnifiedSendService:** Orchestration layer for all send operations
- **EmailNotificationService:** Transactional email templates (invite, reminder, expiry, claim)
- **ContactService:** Recent recipients and favorites management
- **BackgroundTaskService:** Cron-style scheduler for expiry processing

### Database Layer

The app includes a complete in-memory database implementation with TypeScript types. Production-ready to swap with:
- Firebase Firestore
- Supabase
- MongoDB
- PostgreSQL

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your reown credentials. See [Environment Configuration](#environment-configuration) below.

3. Start the Expo development server:

   ```bash
   npm run start
   ```

4. Launch the platform target of your choice:

   - `npm run ios`
   - `npm run android`
   - `npm run web`

## Environment Configuration

Copy `.env.example` to `.env` and configure your secrets:

```bash
cp .env.example .env
```

### Required Environment Variables

| Variable | Description |
| --- | --- |
| `REOWN_PROJECT_ID` | Reown (WalletConnect) project ID from cloud.reown.com |
| `CELO_CHAIN_ID` | Celo network chain ID (11142220 for Sepolia testnet) |
| `CELO_RPC_URL` | Celo RPC endpoint (https://forno.celo-sepolia.celo-testnet.org) |
| `CUSD_TOKEN_ADDRESS` | cUSD token contract address on Celo Sepolia |
| `CUSD_DECIMALS` | cUSD token decimals (18) |

### Email Service Configuration

Choose one email provider and set its API key:

| Variable | Description |
| --- | --- |
| `SENDGRID_API_KEY` | SendGrid API key for transactional emails |
| `RESEND_API_KEY` | Resend API key (alternative to SendGrid) |
| `AWS_SES_REGION` | AWS SES region (alternative email service) |
| `AWS_SES_ACCESS_KEY` | AWS SES access key |
| `AWS_SES_SECRET_KEY` | AWS SES secret key |

### International Provider Keys

| Variable | Description |
| --- | --- |
| `MOONPAY_API_KEY` / `MOONPAY_SECRET_KEY` | MoonPay sell-quote API credentials |
| `TRANSAK_API_KEY` / `TRANSAK_SECRET_KEY` | Transak pricing API + optional secret |
| `PAYCREST_API_KEY` / `PAYCREST_SECRET_KEY` | Paycrest rates API credentials |
| `ALCHEMY_PAY_API_KEY` | Alchemy Pay connector key (optional) |
| `MERCURYO_API_KEY` | Mercuryo API key (optional) |
| `PAYANT_API_KEY` | Payant API key (optional) |
| `PAYBIS_API_KEY` | Paybis API key (optional) |

### App Configuration

| Variable | Description |
| --- | --- |
| `APP_URL` | Production app URL (default: `https://oweza.vercel.app`) |
| `SUPPORT_EMAIL` | Support email address (default: `support@oweza.io`) |

### Escrow & Security

| Variable | Description |
| --- | --- |
| `ESCROW_CONTRACT_ADDRESS` | Deployed `SharedEscrow.sol` contract address (Celo Sepolia) |
| `ESCROW_TREASURY_WALLET` | Wallet address that funds pooled transfers |
| `ESCROW_TOKEN_ADDRESS` | (Optional) Override ERC-20 token address (defaults to cUSD) |
| `ESCROW_NETWORK` | `celo` or `celo-sepolia` to select deployment network |
| `ESCROW_RPC_URL` | Custom RPC endpoint for read operations (defaults to Celo RPC) |
| `ESCROW_SALT_VERSION` | Salt for deterministic transfer IDs (default `OW_ESCROW_V1`) |
| `ESCROW_USE_MOCK` | Set to `true` to disable on-chain calls in local/dev builds |
| `PENDING_TRANSFER_EXPIRY_DAYS` | Days before pending transfers expire (default: 7) |

### Rate Limits

| Variable | Description |
| --- | --- |
| `EMAIL_LOOKUP_RATE_LIMIT` | Max email lookups per minute (default: 100) |
| `SEND_RATE_LIMIT` | Max sends per minute (default: 20) |
| `INVITE_RATE_LIMIT` | Max invites per minute (default: 10) |

### Backend API (Optional)

| Variable | Description |
| --- | --- |
| `OWEZA_API_BASE_URL` | Backend API base URL |
| `OWEZA_API_KEY` | Backend API authentication key |

### Reown AppKit Setup

1. Register your app at [Reown Cloud](https://cloud.reown.com/)
2. Create a new project and get your Project ID
3. Set the redirect URI to: `oweza://` (or your custom scheme)
4. Ensure `app.json` uses the same scheme value
5. Add your Project ID to `.env` as `REOWN_PROJECT_ID`

**Note:** The `.env` file is gitignored to protect your secrets. Never commit credentials to version control.

## Project Structure

```
src/
  components/          # Shared UI components
  config/              # Configuration (Coinbase, chains, etc.)
  navigation/          # React Navigation stacks
  providers/           # Context providers (Coinbase, Paymaster, Theme)
  screens/             # Feature screens
  services/            # Business logic layer
    - database.ts              # In-memory database (production-ready for swap)
    - UserDirectoryService.ts  # User lookup and registration
    - EscrowService.ts         # Temporary wallet management
    - PendingTransferService.ts # Pending transfer lifecycle
    - UnifiedSendService.ts    # Send orchestration
    - EmailNotificationService.ts # Email templates
    - ContactService.ts        # Recent recipients & favorites
    - BackgroundTaskService.ts # Scheduled tasks
    - addressResolution.ts     # Multi-chain address resolution
  types/               # TypeScript type definitions
    - database.ts              # Database schema types
  utils/               # Formatting helpers & theming
```

## Operational Scripts

| Command | Purpose |
| --- | --- |
| `npm run migrate:pending-transfers` | Backfill legacy pending transfers into the shared escrow contract (supports `--dry-run`, `--limit`, `--transferId`, `--resumeFrom`). |

## Next Steps

### Production Deployment

1. **Shared Escrow Monitoring:**
   - Subscribe to `SharedEscrow` events or poll `getTransfer` to keep `escrowStatus` + `lastChainSyncAt` fresh.
   - Alert if on-chain status diverges from MongoDB for more than one hour.

2. **Cron Hardening:**
   - Wire `api/cron/process-expiry` and `send-reminders` to the new `escrowService` helpers.
   - Add retries/backoff around Celo transaction responses.

3. **Data Migration:**
   - Run `npm run migrate:pending-transfers -- --dry-run` and then without `--dry-run` in each environment.
   - Remove legacy escrow columns once all rows have `escrowTransferId`.

4. **Multi-Token Support:**
   - Extend `SharedEscrowDriver` to support additional Celo stable tokens (cEUR, cREAL).
   - Add UI configuration for selecting token per transfer.

5. **Testing:**
   - `npx hardhat test` for contract coverage.
   - `npx tsc --noEmit` and `npm run server:build` for backend health.
   - Expo smoke tests for send/claim/cancel flows (registered + pending recipients).

➡️ **Render backend?** Follow `docs/render-deployment.md` for service provisioning and `docs/migrations/shared-escrow.md` for the step-by-step migration runbook.

### Development Workflow

- **Live Data Only:** Demo seeds have been removed—use Coinbase signup plus `npm run backfill` (with your own JSON payloads) if you need fixtures.
- **Environment Variables:** All credentials are in `.env` (gitignored)
- **TypeScript Strict Mode:** Full type safety throughout the codebase
- **Service Layer:** Clean separation between UI and business logic

## License

This project is released under the MIT license.
