import cron from "node-cron";
import { MembershipService } from "../../features/memberships/membership.service";

/**
 * Starts all background scheduled jobs for subscription lifecycle management.
 *
 * Jobs:
 *  1. Every hour  — Expire all subscriptions whose endDate has passed.
 *  2. Every day at midnight — Send renewal reminder emails for plans expiring in ≤3 days.
 */
export function startSubscriptionScheduler(): void {
  // ─── Job 1: Hourly expiry sweep ───────────────────────────────────────────
  // Runs at minute 0 of every hour (e.g. 01:00, 02:00, …)
  cron.schedule(
    "0 * * * *",
    async () => {
      const now = new Date().toISOString();
      console.log(`[Scheduler] ⏰ Running subscription expiry sweep at ${now}`);
      try {
        await MembershipService.expireOverdueSubscriptions();
        console.log(`[Scheduler] ✅ Subscription expiry sweep complete.`);
      } catch (err) {
        console.error("[Scheduler] ❌ Expiry sweep failed:", err);
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  // ─── Job 2: Daily renewal reminder emails at midnight ─────────────────────
  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log("[Scheduler] 📧 Running daily renewal reminder email job...");
      try {
        await MembershipService.checkExpiringSubscriptionsAndNotify();
        console.log("[Scheduler] ✅ Renewal reminder emails dispatched.");
      } catch (err) {
        console.error("[Scheduler] ❌ Renewal reminder job failed:", err);
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  console.log("🗓️  Subscription scheduler started: hourly expiry sweep + daily renewal reminders.");
}
