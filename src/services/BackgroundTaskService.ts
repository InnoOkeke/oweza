/**
 * Background Tasks / Cron Jobs
 * Handles scheduled tasks for pending transfers
 * 
 * In production, use a proper job scheduler:
 * - expo-task-manager for React Native background tasks
 * - Node-cron for backend
 * - AWS Lambda/CloudWatch Events
 * - Google Cloud Scheduler
 */

import { pendingTransferService } from "./PendingTransferService";

declare const __DEV__: boolean | undefined;

class BackgroundTaskService {
  private intervals: NodeJS.Timeout[] = [];

  /**
   * Start all background tasks
   */
  startAll() {
    // Run expiry check every hour
    this.scheduleTask(
      "expire-transfers",
      async () => {
        console.log("🔄 Running expired transfers check...");
        const count = await pendingTransferService.expirePendingTransfers();
        console.log(`✅ Expired ${count} pending transfers`);
      },
      60 * 60 * 1000 // 1 hour
    );

    // Run reminder check every 6 hours
    this.scheduleTask(
      "send-reminders",
      async () => {
        console.log("📧 Sending expiry reminders...");
        const count = await pendingTransferService.sendExpiryReminders();
        console.log(`✅ Sent ${count} expiry reminders`);
      },
      6 * 60 * 60 * 1000 // 6 hours
    );

    console.log("✅ Background tasks started");
  }

  /**
   * Stop all background tasks
   */
  stopAll() {
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals = [];
    console.log("⏹️ Background tasks stopped");
  }

  /**
   * Run a task immediately (for testing)
   */
  async runTask(taskName: "expire-transfers" | "send-reminders") {
    console.log(`▶️ Manually running task: ${taskName}`);
    
    switch (taskName) {
      case "expire-transfers":
        const expiredCount = await pendingTransferService.expirePendingTransfers();
        console.log(`✅ Expired ${expiredCount} pending transfers`);
        break;
        
      case "send-reminders":
        const reminderCount = await pendingTransferService.sendExpiryReminders();
        console.log(`✅ Sent ${reminderCount} expiry reminders`);
        break;
    }
  }

  private scheduleTask(name: string, task: () => Promise<void>, intervalMs: number) {
    // Run immediately on start
    task().catch((error) => {
      console.error(`❌ Error in ${name}:`, error);
    });

    // Then schedule for regular intervals
    const interval = setInterval(async () => {
      try {
        await task();
      } catch (error) {
        console.error(`❌ Error in ${name}:`, error);
      }
    }, intervalMs);

    this.intervals.push(interval);
  }
}

// Export singleton instance
export const backgroundTaskService = new BackgroundTaskService();

// Auto-start in development (comment out in production)
if (typeof __DEV__ !== "undefined" && __DEV__) {
  // Don't auto-start in dev to avoid unnecessary background tasks
  // Uncomment if you want to test:
  // backgroundTaskService.startAll();
}
