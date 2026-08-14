import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { Polar } from "@polar-sh/sdk";
import { env } from "./config/env";

async function testCancelSdk() {
  const polar = new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN!,
    server: "sandbox",
  });

  try {
    const subsList = await polar.subscriptions.list({ limit: 5 });
    const items = (subsList as any)?.result?.items || (subsList as any)?.items || [];
    if (items.length === 0) {
      console.log("No subscriptions found in Polar Sandbox.");
      process.exit(0);
    }

    const activeSub = items.find((s: any) => s.status === "active") || items[0];
    console.log(`Testing cancelAtPeriodEnd on Sub ID: ${activeSub.id} (Current status: ${activeSub.status}, cancelAtPeriodEnd: ${(activeSub as any).cancelAtPeriodEnd})`);

    // Let's test calling polar.subscriptions.update
    const updated = await polar.subscriptions.update({
      id: activeSub.id,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });

    console.log("\n✅ Successfully updated Polar subscription cancelAtPeriodEnd via SDK:");
    console.log("Status:", (updated as any).status);
    console.log("CancelAtPeriodEnd:", (updated as any).cancelAtPeriodEnd);
    console.log("EndsAt / CurrentPeriodEnd:", (updated as any).endsAt || (updated as any).currentPeriodEnd);
  } catch (err: any) {
    console.error("❌ Polar SDK update error:", err);
  }

  process.exit(0);
}

testCancelSdk();
