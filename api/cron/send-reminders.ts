/**
 * Vercel Cron Function: Send Reminder Emails
 * Runs every 6 hours to send reminder emails for expiring transfers
 * 
 * Vercel Cron: 0 *\/6 * * * (every 6 hours)
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
    console.log("📧 Sending reminder emails for expiring transfers...");

    const sentCount = await pendingTransferService.sendExpiryReminders();

    console.log(`✅ Sent ${sentCount} reminder emails`);

    return res.status(200).json({
      success: true,
      sent: sentCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error sending reminder emails:", error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
