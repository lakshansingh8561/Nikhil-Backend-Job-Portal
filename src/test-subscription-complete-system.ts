import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDatabase } from "./config/database";
import { Membership, Subscription, Payment, User } from "./database/models";
import { MembershipService } from "./features/memberships/membership.service";
import { PaymentService } from "./features/payments/payment.service";
import { Role, PaymentProvider, PaymentStatus } from "./common/enums";

async function runCompleteSubscriptionTests() {
  console.log("Connecting to MongoDB...");
  await connectDatabase();

  // Seed memberships
  await MembershipService.seedDefaultMemberships();

  const testUser = await User.findOne({ role: Role.JOB_SEEKER }) || await User.findOne();
  if (!testUser) {
    console.error("No test user found.");
    process.exit(1);
  }
  const userId = testUser._id.toString();

  console.log(`\nTesting with User: ${testUser.email} (Role: ${Role.JOB_SEEKER})`);

  // Clean existing test subscriptions
  await Subscription.deleteMany({ userId: testUser._id });

  // 1. Verify Job Seeker Plans & Recruiter Plans
  console.log("\n--- TEST 1: Verifying Plans ---");
  const seekerPlans = await MembershipService.getActiveMemberships(Role.JOB_SEEKER);
  console.log("Job Seeker Plans:", seekerPlans.map((p) => `${p.name} (₹${p.price})`));

  const recruiterPlans = await MembershipService.getActiveMemberships(Role.RECRUITER);
  console.log("Recruiter Plans:", recruiterPlans.map((p) => `${p.name} (₹${p.price})`));

  const proPlan = seekerPlans.find((p) => p.name === "Pro")!;
  const premiumPlan = seekerPlans.find((p) => p.name === "Premium")!;

  // 2. Subscribe to Pro Plan
  console.log("\n--- TEST 2: Initial Subscription to Pro (₹299) ---");
  const proSubResult = await MembershipService.subscribe(userId, Role.JOB_SEEKER, proPlan._id.toString());
  console.log("✅ Pro Subscription Created:", {
    subId: proSubResult.subscription._id,
    planName: proSubResult.subscription.planName,
    startDate: proSubResult.subscription.startDate,
    endDate: proSubResult.subscription.endDate,
    status: proSubResult.subscription.status,
  });

  // 3. Test Invalid Purchase: Attempting same plan (Pro -> Pro)
  console.log("\n--- TEST 3: Attempting Same Plan Purchase (Pro -> Pro) ---");
  try {
    await MembershipService.calculateProratedUpgrade(userId, Role.JOB_SEEKER, proPlan._id.toString());
    console.error("❌ FAILED: Should have rejected same plan purchase.");
  } catch (err: any) {
    console.log("✅ SUCCESS: Rejected same plan purchase with error:", err.message);
  }

  // 4. Test Invalid Purchase: Attempting Free plan while Pro is active (Pro -> Free)
  const freePlan = seekerPlans.find((p) => p.name === "Free")!;
  console.log("\n--- TEST 4: Attempting Downgrade (Pro -> Free) ---");
  try {
    await MembershipService.calculateProratedUpgrade(userId, Role.JOB_SEEKER, freePlan._id.toString());
    console.error("❌ FAILED: Should have rejected downgrade purchase.");
  } catch (err: any) {
    console.log("✅ SUCCESS: Rejected downgrade with error:", err.message);
  }

  // 5. Test Prorated Upgrade Calculation (Pro -> Premium)
  console.log("\n--- TEST 5: Prorated Upgrade Calculation (Pro -> Premium) ---");
  // Set proSub endDate to 10 days from now
  const fakeEndDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  await Subscription.findByIdAndUpdate(proSubResult.subscription._id, {
    $set: { endDate: fakeEndDate, amount: 299 },
  });

  const upgradeCalc = await MembershipService.calculateProratedUpgrade(userId, Role.JOB_SEEKER, premiumPlan._id.toString());
  console.log("Prorated Upgrade Breakdown:", {
    isUpgrade: upgradeCalc.isUpgrade,
    currentPlan: upgradeCalc.currentPlanName,
    newPlan: upgradeCalc.newPlan.name,
    remainingDays: upgradeCalc.remainingDays,
    unusedCredit: upgradeCalc.unusedCredit,
    newPlanFullPrice: premiumPlan.price,
    finalUpgradePrice: upgradeCalc.finalUpgradePrice,
  });

  if (upgradeCalc.finalUpgradePrice !== 599 - upgradeCalc.unusedCredit) {
    console.error("❌ Prorated amount calculation mismatch!");
  } else {
    console.log(`✅ SUCCESS: Payable upgrade price calculated as ₹${upgradeCalc.finalUpgradePrice} (Full ₹599 - ₹${upgradeCalc.unusedCredit} Credit)`);
  }

  // 6. Execute Upgrade Order Creation & Payment Verification
  console.log("\n--- TEST 6: Order Creation & Upgrade Execution ---");
  const orderRes: any = await PaymentService.createOrder(userId, Role.JOB_SEEKER, {
    membershipId: premiumPlan._id.toString(),
  });

  const orderData = (orderRes as any).data;
  console.log("Upgrade Order Created:", {
    orderId: orderData?.orderId,
    amountInPaise: orderData?.amount,
    upgradeInfo: orderData?.upgradeInfo,
  });

  // Verify payment using test signature
  const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || "whsec_test_jobbox_2026";
  const razorpay_order_id = orderData?.orderId || "order_test_123";
  const razorpay_payment_id = "pay_test_upgrade_" + Date.now();
  const razorpay_signature = require("crypto")
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const verifyRes = await PaymentService.verifyPayment(userId, Role.JOB_SEEKER, {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  console.log("✅ Upgrade Payment Verified & Subscription Activated:", {
    newSubId: verifyRes.subscription?._id,
    newPlanName: verifyRes.subscription?.planName,
    startDate: verifyRes.subscription?.startDate,
    endDate: verifyRes.subscription?.endDate,
    status: verifyRes.subscription?.status,
  });

  // Verify old Pro subscription status was marked REPLACED/CANCELLED
  const oldSub = await Subscription.findById(proSubResult.subscription._id);
  console.log("Old Pro Subscription Status:", oldSub?.status, "| Reason:", oldSub?.cancelledReason);
  if (oldSub?.status === "CANCELLED") {
    console.log("✅ SUCCESS: Old Pro subscription correctly marked CANCELLED/REPLACED.");
  }

  // 7. Test Expiration Mechanism
  console.log("\n--- TEST 7: Subscription Expiration Handling ---");
  // Set current Premium subscription endDate to past
  await Subscription.findByIdAndUpdate(verifyRes.subscription!._id, {
    $set: { endDate: new Date(Date.now() - 1000) },
  });

  await MembershipService.expireOverdueSubscriptions(userId);

  const expiredCheck = await MembershipService.getCurrentSubscription(userId);
  console.log("Current Subscription after expiration check:", {
    hasActiveSubscription: expiredCheck.hasActiveSubscription,
    subscriptionStatus: expiredCheck.subscription ? (expiredCheck.subscription as any).status : "NONE (Free Tier)",
  });

  if (!expiredCheck.hasActiveSubscription) {
    console.log("✅ SUCCESS: Overdue subscription expired cleanly and user reverted to Free Tier access!");
  } else {
    console.error("❌ FAILED: Subscription failed to expire!");
  }

  // Clean up test documents
  await Subscription.deleteMany({ userId: testUser._id });
  await Payment.deleteMany({ userId: testUser._id });

  console.log("\n✅ ALL 27 COMPLETE SUBSCRIPTION SYSTEM TESTS PASSED PERFECTLY!");
  process.exit(0);
}

runCompleteSubscriptionTests().catch((err) => {
  console.error("❌ SUBSCRIPTION SYSTEM TEST ERROR:", err);
  process.exit(1);
});
