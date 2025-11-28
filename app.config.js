import "dotenv/config";

export default ({ config }) => ({
  ...config,
  android: {
    package: "com.kellonapp.oweza",
  },
  ios: {
    bundleIdentifier: "com.kellonapp.oweza"
  },
  extra: {
    ...config.extra,
    // Reown Configuration
    reownProjectId: process.env.REOWN_PROJECT_ID || "",

    // Circle Configuration (legacy, may remove)
    circleApiKey: process.env.CIRCLE_API_KEY || "",

    // Ramp Providers
    moonpayApiKey: process.env.MOONPAY_API_KEY || "",
    moonpaySecretKey: process.env.MOONPAY_SECRET_KEY || "",
    transakApiKey: process.env.TRANSAK_API_KEY || "",
    transakSecretKey: process.env.TRANSAK_SECRET_KEY || "",
    paycrestApiKey: process.env.PAYCREST_API_KEY || "",
    paycrestSecretKey: process.env.PAYCREST_SECRET_KEY || "",
    
    // Escrow Configuration
    escrowMockMode: (process.env.ESCROW_USE_MOCK || "true") !== "false",
    pendingTransferExpiryDays: parseInt(process.env.PENDING_TRANSFER_EXPIRY_DAYS || "7", 10),

    // Rate Limits
    emailLookupRateLimit: parseInt(process.env.EMAIL_LOOKUP_RATE_LIMIT || "100", 10),
    sendRateLimit: parseInt(process.env.SEND_RATE_LIMIT || "20", 10),
    inviteRateLimit: parseInt(process.env.INVITE_RATE_LIMIT || "10", 10),

    // Backend API
    mongodbUri: process.env.MONGODB_URI || "",
    owezaApiBaseUrl: process.env.OWEZA_API_BASE_URL || "",
    owezaApiKey: process.env.OWEZA_API_KEY || "",

    eas: {
      projectId: process.env.EAS_PROJECT_ID || "",
    },
  },
  plugins: [
    "expo-localization",
    "expo-secure-store",
    "./withProGuardRules",
    "./withKotlinJvmTarget"
  ],
});