import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDatabase } from "./config/database";
import { Membership, Subscription, Payment, User } from "./database/models";
import { PaymentProvider, PaymentStatus, Role } from "./common/enums";
import { Types } from "mongoose";

async function testPaymentArchitecture() {
  console.log("Connecting to MongoDB...");
  await connectDatabase();

  console.log("\n1. Verifying Membership Models & Enums...");
  const sampleUser = await User.findOne({ role: Role.JOB_SEEKER }) || await User.findOne();
  if (!sampleUser) {
    console.log("No test user found in DB.");
    process.exit(0);
  }

  let membership = await Membership.findOne({ role: Role.JOB_SEEKER, price: { $gt: 0 } });
  if (!membership) {
    membership = await Membership.create({
      name: "Pro Test Plan",
      role: Role.JOB_SEEKER,
      price: 999,
      currency: "INR",
      durationInDays: 30,
      description: "Test premium plan",
      isActive: true,
    });
  }

  console.log(`Membership found: "${membership.name}" - ₹${membership.price} for ${membership.durationInDays} days.`);

  // 2. Test Subscription creation with computed dates
  console.log("\n2. Testing Provider-Independent Subscription Creation...");
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + membership.durationInDays * 24 * 60 * 60 * 1000);

  const testSubscription = await Subscription.create({
    userId: sampleUser._id,
    membershipId: membership._id,
    role: Role.JOB_SEEKER,
    planName: membership.name,
    amount: membership.price,
    currency: membership.currency,
    startDate,
    endDate,
    currentPeriodStart: startDate,
    currentPeriodEnd: endDate,
    status: "ACTIVE",
    autoRenew: true,
  });

  console.log(`Subscription created successfully! ID: ${testSubscription._id}, End Date: ${testSubscription.endDate.toISOString()}`);

  // 3. Test Razorpay Payment record creation using generic provider fields
  console.log("\n3. Testing Razorpay Payment Record Creation...");
  const razorpayPayment = await Payment.create({
    userId: sampleUser._id,
    membershipId: membership._id,
    subscriptionId: testSubscription._id,
    amount: Math.round(membership.price * 100),
    currency: membership.currency,
    provider: PaymentProvider.RAZORPAY,
    status: PaymentStatus.SUCCESS,
    providerOrderId: "order_test_rzp_" + Date.now(),
    providerPaymentId: "pay_test_rzp_" + Date.now(),
    paymentMethod: "UPI",
    paidAt: new Date(),
    providerData: {
      signature: "test_razorpay_signature_hash_123",
    },
  });

  console.log("✅ Razorpay Payment Saved:", {
    id: razorpayPayment._id,
    provider: razorpayPayment.provider,
    status: razorpayPayment.status,
    providerOrderId: razorpayPayment.providerOrderId,
    providerPaymentId: razorpayPayment.providerPaymentId,
  });

  // 4. Test Polar Payment record creation using generic provider fields
  console.log("\n4. Testing Polar Payment Record Creation...");
  const polarPayment = await Payment.create({
    userId: sampleUser._id,
    membershipId: membership._id,
    subscriptionId: testSubscription._id,
    amount: Math.round(membership.price * 100),
    currency: "USD",
    provider: PaymentProvider.POLAR,
    status: PaymentStatus.SUCCESS,
    providerOrderId: "polar_checkout_" + Date.now(),
    providerPaymentId: "polar_pay_" + Date.now(),
    providerSubscriptionId: "polar_sub_" + Date.now(),
    paymentMethod: "CARD",
    paidAt: new Date(),
    providerData: {
      checkoutId: "polar_checkout_" + Date.now(),
    },
  });

  console.log("✅ Polar Payment Saved:", {
    id: polarPayment._id,
    provider: polarPayment.provider,
    status: polarPayment.status,
    providerOrderId: polarPayment.providerOrderId,
    providerPaymentId: polarPayment.providerPaymentId,
    providerSubscriptionId: polarPayment.providerSubscriptionId,
  });

  // Clean up test documents
  await Payment.deleteMany({ _id: { $in: [razorpayPayment._id, polarPayment._id] } });
  await Subscription.deleteOne({ _id: testSubscription._id });
  console.log("\n✅ All Architecture Tests Passed Successfully!");
  process.exit(0);
}

testPaymentArchitecture().catch((err) => {
  console.error("❌ PAYMENT ARCHITECTURE TEST FAILED:", err);
  process.exit(1);
});
