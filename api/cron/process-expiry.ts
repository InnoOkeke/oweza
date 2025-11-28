/**
 * Vercel Cron Function: Process Expired Pending Transfers
 * Runs hourly to check for expired transfers and refund to senders
 * 
 * Vercel Cron: 0 * * * * (every hour)
 */

import { pendingTransferService } from "../../src/services/PendingTransferService";

export const config = {
  runtime: "nodejs",
  maxDuration: 60, // 60 seconds max
};

export default async function handler(req: any, res: any) {
  // Verify this is called by Vercel Cron
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("🔄 Processing expired pending transfers...");

    const processed = await pendingTransferService.expirePendingTransfers();

    console.log(`✅ Processed ${processed} expired transfers`);

    return res.status(200).json({
      success: true,
      processed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error processing expired transfers:", error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
