/**
 * RazorpaySubscriptionService
 *
 * Handles Razorpay's recurring subscription API (separate from one-time orders).
 * Uses razorpay.plans.* and razorpay.subscriptions.* — NOT razorpay.orders.create.
 *
 * Razorpay Subscriptions docs:
 *   https://razorpay.com/docs/payments/subscriptions/
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import { Types } from "mongoose";
import { env } from "../../config/env";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { PaymentProvider, PaymentStatus, SubscriptionStatus, Role } from "../../common/enums";
import { Membership, Payment, Subscription, BillingCycle, IMembership } from "../../database/models";
import { MembershipRepository } from "../memberships/membership.repository";
import { MembershipService } from "../memberships/membership.service";
import { PaymentRepository } from "./payment.repository";

export type PlanKey = "pro" | "premium" | "professional" | "enterprise";

/** Maps plan name → Razorpay Plan ID from env */
const RAZORPAY_PLAN_MAP: Record<string, () => string> = {
  pro: () => env.RAZORPAY_JOBSEEKER_PRO_ID,
  premium: () => env.RAZORPAY_JOBSEEKER_PREMIUM_ID,
  professional: () => env.RAZORPAY_RECRUITER_PROFESSIONAL_ID,
  proffessional: () => env.RAZORPAY_RECRUITER_PROFESSIONAL_ID,
  enterprise: () => env.RAZORPAY_RECRUITER_ENTERPRISE_ID,
};

export class RazorpaySubscriptionService {
  private static getInstance(): Razorpay {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Razorpay credentials are not configured on the server."
      );
    }
    return new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }

  /**
   * Resolve Razorpay Plan ID directly from environment variables or DB prices array
   */
  static resolveRazorpayPlanId(plan: IMembership, userRole: string, billingCycle?: BillingCycle): string {
    // 1. FIRST PRIORITY: Check top-level plan.planId directly saved in DB by Admin
    if (plan.planId && plan.planId.trim().length > 0) {
      console.log(`[Razorpay ID Resolution] Using plan.planId from DB for '${plan.name}': ${plan.planId}`);
      return plan.planId.trim();
    }

    // 2. Check DB prices array
    if (plan.prices && plan.prices.length > 0) {
      const cycle = billingCycle || "monthly";
      const matchPrice = plan.prices.find((p) => p.billingCycle === cycle) || plan.prices.find((p) => p.currency === "INR") || plan.prices[0];
      if (matchPrice && matchPrice.providerPriceIds) {
        const providerMatch = matchPrice.providerPriceIds.find(
          (pid) => pid.provider === PaymentProvider.RAZORPAY
        );
        if (providerMatch && providerMatch.providerPlanId && providerMatch.providerPlanId.trim().length > 0) {
          console.log(`[Razorpay ID Resolution] Using providerPriceIds from DB for '${plan.name}': ${providerMatch.providerPlanId}`);
          return providerMatch.providerPlanId.trim();
        }
      }
    }

    // 3. Fallback to role + plan name env mapping
    const planKey = (plan.name || "").toLowerCase();
    const roleKey = (userRole || "").toLowerCase();

    if (roleKey.includes("seeker") || roleKey.includes("candidate")) {
      if (planKey.includes("pro")) return env.RAZORPAY_JOBSEEKER_PRO_ID;
      if (planKey.includes("premium")) return env.RAZORPAY_JOBSEEKER_PREMIUM_ID;
    } else {
      if (planKey.includes("professional") || planKey.includes("proffessional") || planKey.includes("pro")) {
        return env.RAZORPAY_RECRUITER_PROFESSIONAL_ID;
      }
      if (planKey.includes("enterprise")) return env.RAZORPAY_RECRUITER_ENTERPRISE_ID;
    }

    // Direct planKey lookup fallback
    if (RAZORPAY_PLAN_MAP[planKey]) {
      const id = RAZORPAY_PLAN_MAP[planKey]();
      if (id) return id;
    }

    throw new ApiError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      `Razorpay plan ID for ${plan.name} (${userRole}) is not configured in .env or database.`
    );
  }

  /**
   * Create a Razorpay recurring subscription.
   */
  static async createSubscription(
    userId: string,
    userRole: string,
    membershipId: string,
    planKey?: string,
    billingCycle: BillingCycle = "monthly"
  ) {
    const upgradeCalc = await MembershipService.calculateProratedUpgrade(
      userId,
      userRole as Role,
      membershipId,
      billingCycle
    );

    const plan = upgradeCalc.newPlan;
    const priceDetails = upgradeCalc.priceDetails;
    const effectivePlanKey = planKey || (plan.name || "").toLowerCase();

    if (priceDetails.price === 0) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Free plans do not require Razorpay subscription. Use direct subscribe."
      );
    }

    const razorpayPlanId = this.resolveRazorpayPlanId(plan, userRole, billingCycle);

    console.log(`[Razorpay] Creating subscription: userId=${userId} plan=${plan.name}/${billingCycle} planId=${razorpayPlanId}`);

    const razorpay = this.getInstance();

    const razorpaySubscription = await (razorpay.subscriptions as any).create({
      plan_id: razorpayPlanId,
      total_count: billingCycle === "yearly" ? 12 : 120,
      quantity: 1,
      customer_notify: 0,
      notes: {
        userId,
        membershipId: plan._id.toString(),
        userRole,
        planName: plan.name,
        planKey: effectivePlanKey,
        billingCycle,
        provider: PaymentProvider.RAZORPAY,
      },
    });

    console.log(`[Razorpay] Subscription created: subId=${razorpaySubscription.id}`);

    // Store a PENDING payment record tied to this subscription
    await PaymentRepository.createPayment({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      amount: priceDetails.price * 100, // in paise
      currency: priceDetails.currency,
      status: PaymentStatus.PENDING,
      provider: PaymentProvider.RAZORPAY,
      providerSubscriptionId: razorpaySubscription.id,
      providerData: {
        planKey,
        billingCycle,
        razorpayPlanId,
        razorpaySubscription,
      },
      metadata: {
        planKey,
        billingCycle,
        membershipId: plan._id.toString(),
      },
    });

    return {
      subscriptionId: razorpaySubscription.id,
      keyId: env.RAZORPAY_KEY_ID,
      planName: plan.name,
      planKey,
      billingCycle,
      amount: priceDetails.price * 100,
      currency: priceDetails.currency,
      membership: {
        id: plan._id,
        name: plan.name,
        price: priceDetails.price,
        durationInDays: priceDetails.durationInDays,
      },
    };
  }

  /**
   * Verify initial Razorpay subscription payment
   */
  static async verifySubscriptionPayment(
    userId: string,
    userRole: string,
    payload: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
    }
  ) {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = payload;

    // HMAC verification for subscriptions
    const generatedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Razorpay subscription signature verification failed.");
    }

    // Idempotency check: if subscription already active, return it
    const existingSub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      providerSubscriptionId: razorpay_subscription_id,
      status: SubscriptionStatus.ACTIVE,
      isDeleted: { $ne: true },
    });
    if (existingSub) {
      console.log(`[Razorpay] Subscription already active: subId=${razorpay_subscription_id}`);
      return { message: "Subscription already active.", subscription: existingSub };
    }

    // Fetch existing pending payment record
    const payment = await Payment.findOne({ providerSubscriptionId: razorpay_subscription_id });
    if (!payment) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Payment record for subscription not found.");
    }

    if (payment.userId.toString() !== userId) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "This payment does not belong to the authenticated user.");
    }

    const plan = await Membership.findById(payment.membershipId);
    if (!plan) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Membership plan not found.");
    }

    const billingCycle: BillingCycle = (payment.metadata?.billingCycle as BillingCycle) || "monthly";
    const priceDetails = MembershipService.getPlanPriceDetails(plan, billingCycle);

    // Expire old active subscriptions
    await MembershipRepository.expireActiveSubscriptions(userId);

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + priceDetails.durationInDays * 24 * 60 * 60 * 1000);

    const subscription = await MembershipRepository.createSubscription({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      role: userRole,
      planName: plan.name,
      amount: priceDetails.price,
      currency: priceDetails.currency,
      billingCycle,
      provider: PaymentProvider.RAZORPAY,
      startDate,
      endDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      providerSubscriptionId: razorpay_subscription_id,
      nextBillingDate: endDate,
      lastPaymentStatus: "SUCCESS",
    });

    // Update payment record
    payment.status = PaymentStatus.SUCCESS;
    payment.providerPaymentId = razorpay_payment_id;
    payment.subscriptionId = subscription._id;
    payment.paidAt = new Date();
    await payment.save();

    console.log(`[Razorpay] Subscription verified and activated: userId=${userId} subId=${razorpay_subscription_id}`);

    return {
      message: "Razorpay subscription payment verified and activated successfully.",
      subscription,
      payment,
    };
  }

  /**
   * Cancel Razorpay subscription (sets cancelAtPeriodEnd = true)
   */
  static async cancelSubscription(
    userId: string,
    cancelAtPeriodEnd: boolean = true
  ) {
    const sub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      status: SubscriptionStatus.ACTIVE,
      isDeleted: { $ne: true },
    });

    if (!sub) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "No active Razorpay subscription found.");
    }

    let effectiveSubId = sub.providerSubscriptionId;
    if (!effectiveSubId && sub.membershipId) {
      const plan = await Membership.findById(sub.membershipId);
      if (plan && plan.planId && plan.planId.trim().length > 0) {
        effectiveSubId = plan.planId.trim();
        sub.providerSubscriptionId = effectiveSubId;
      }
    }

    if (effectiveSubId && effectiveSubId.startsWith("sub_")) {
      try {
        const razorpay = this.getInstance();
        console.log(`[Razorpay] Cancelling subscription on gateway: subId=${effectiveSubId} cancelAtEnd=${cancelAtPeriodEnd}`);
        await (razorpay.subscriptions as any).cancel(
          effectiveSubId,
          cancelAtPeriodEnd ? 1 : 0
        );
      } catch (err: any) {
        console.warn(`[Razorpay] Warning: Gateway cancel call failed (may already be cancelled): ${err?.message}`);
      }
    }

    sub.cancelAtPeriodEnd = cancelAtPeriodEnd;
    sub.cancelledAt = new Date();

    if (!cancelAtPeriodEnd) {
      sub.status = SubscriptionStatus.CANCELLED;
      sub.cancelledReason = "Cancelled immediately by user";
    }

    await sub.save();

    const endDateFormatted = sub.currentPeriodEnd
      ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN")
      : sub.endDate
      ? new Date(sub.endDate).toLocaleDateString("en-IN")
      : "period end";

    return {
      message: cancelAtPeriodEnd
        ? `AutoPay cancelled successfully. Paid access remains active until ${endDateFormatted}.`
        : "Subscription cancelled immediately.",
      subscription: sub,
    };
  }

  /**
   * Reactivate Razorpay AutoPay (sets cancelAtPeriodEnd = false)
   */
  static async reactivateAutoPay(userId: string) {
    const sub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      status: SubscriptionStatus.ACTIVE,
      isDeleted: { $ne: true },
    });

    if (!sub) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "No active subscription found to reactivate.");
    }

    if (!sub.cancelAtPeriodEnd) {
      return {
        message: "AutoPay is already active for this subscription.",
        subscription: sub,
      };
    }

    let effectiveSubId = sub.providerSubscriptionId;
    if (!effectiveSubId && sub.membershipId) {
      const plan = await Membership.findById(sub.membershipId);
      if (plan && plan.planId && plan.planId.trim().length > 0) {
        effectiveSubId = plan.planId.trim();
        sub.providerSubscriptionId = effectiveSubId;
      }
    }

    if (effectiveSubId && effectiveSubId.startsWith("sub_")) {
      try {
        const razorpay = this.getInstance();
        console.log(`[Razorpay] Reactivating subscription on gateway: subId=${effectiveSubId}`);
        await (razorpay.subscriptions as any).resume(effectiveSubId).catch(() => null);
      } catch (err: any) {
        console.warn(`[Razorpay] Warning: Gateway resume call failed: ${err?.message}`);
      }
    }

    sub.cancelAtPeriodEnd = false;
    sub.cancelledAt = undefined;
    sub.cancelledReason = undefined;
    await sub.save();

    return {
      message: "Razorpay AutoPay reactivated! Your subscription will auto-renew 🎉",
      subscription: sub,
    };
  }

  /**
   * Process Razorpay subscription webhook events.
   */
  static async processSubscriptionWebhookEvent(event: any) {
    const eventType: string = event.event;
    const subscriptionEntity = event.payload?.subscription?.entity;
    const paymentEntity = event.payload?.payment?.entity;

    if (!subscriptionEntity) {
      return { handled: false, reason: "No subscription entity in payload" };
    }

    const razorpaySubId: string = subscriptionEntity.id;
    const sub = await Subscription.findOne({ providerSubscriptionId: razorpaySubId });

    console.log(`[Razorpay] Webhook: event=${eventType} subId=${razorpaySubId}`);

    switch (eventType) {
      case "subscription.activated": {
        if (sub) {
          sub.status = SubscriptionStatus.ACTIVE;
          sub.cancelAtPeriodEnd = false;
          if (subscriptionEntity.current_end) {
            sub.nextBillingDate = new Date(subscriptionEntity.current_end * 1000);
            sub.currentPeriodEnd = new Date(subscriptionEntity.current_end * 1000);
            sub.endDate = new Date(subscriptionEntity.current_end * 1000);
          }
          await sub.save();
        }
        break;
      }

      case "subscription.charged": {
        if (sub && paymentEntity) {
          const alreadyProcessed = await Payment.findOne({
            providerPaymentId: paymentEntity.id,
            providerSubscriptionId: razorpaySubId,
          });

          if (!alreadyProcessed) {
            await PaymentRepository.createPayment({
              userId: sub.userId,
              membershipId: sub.membershipId as Types.ObjectId,
              subscriptionId: sub._id as Types.ObjectId,
              amount: paymentEntity.amount || 0,
              currency: paymentEntity.currency || "INR",
              status: PaymentStatus.SUCCESS,
              provider: PaymentProvider.RAZORPAY,
              providerPaymentId: paymentEntity.id,
              providerSubscriptionId: razorpaySubId,
              paidAt: new Date(),
            });
          }

          if (subscriptionEntity.current_start && subscriptionEntity.current_end) {
            sub.currentPeriodStart = new Date(subscriptionEntity.current_start * 1000);
            sub.currentPeriodEnd = new Date(subscriptionEntity.current_end * 1000);
            sub.endDate = new Date(subscriptionEntity.current_end * 1000);
            sub.nextBillingDate = new Date(subscriptionEntity.current_end * 1000);
            sub.lastPaymentStatus = "SUCCESS";
            sub.status = SubscriptionStatus.ACTIVE;
            await sub.save();
          }
        }
        break;
      }

      case "subscription.cancelled": {
        if (sub) {
          sub.cancelAtPeriodEnd = true;
          sub.cancelledAt = new Date();
          await sub.save();
        }
        break;
      }

      case "subscription.completed":
      case "subscription.expired": {
        if (sub) {
          sub.status = SubscriptionStatus.EXPIRED;
          await sub.save();
        }
        break;
      }

      case "subscription.halted": {
        if (sub) {
          sub.status = SubscriptionStatus.PAST_DUE;
          sub.lastPaymentStatus = "FAILED";
          await sub.save();
        }
        break;
      }

      case "payment.failed": {
        if (sub && paymentEntity) {
          sub.lastPaymentStatus = "FAILED";
          await sub.save();

          const alreadyProcessed = await Payment.findOne({
            providerPaymentId: paymentEntity.id,
          });
          if (!alreadyProcessed) {
            await PaymentRepository.createPayment({
              userId: sub.userId,
              membershipId: sub.membershipId as Types.ObjectId,
              subscriptionId: sub._id as Types.ObjectId,
              amount: paymentEntity.amount || 0,
              currency: paymentEntity.currency || "INR",
              status: PaymentStatus.FAILED,
              provider: PaymentProvider.RAZORPAY,
              providerPaymentId: paymentEntity.id || null,
              providerSubscriptionId: razorpaySubId,
              failureReason: paymentEntity.error_description || "Payment failed",
            });
          }
        }
        break;
      }

      default:
        return { handled: false, reason: `Unhandled subscription event: ${eventType}` };
    }

    console.log(`[Razorpay] Webhook processed: event=${eventType} subId=${razorpaySubId}`);
    return { handled: true };
  }
}
