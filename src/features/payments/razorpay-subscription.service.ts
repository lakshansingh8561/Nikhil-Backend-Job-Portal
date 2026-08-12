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
import { PaymentProvider, PaymentStatus } from "../../common/enums";
import { Membership, Payment, Subscription } from "../../database/models";
import { MembershipRepository } from "../memberships/membership.repository";
import { PaymentRepository } from "./payment.repository";

export type BillingCycle = "monthly" | "yearly";
export type PlanKey = "pro" | "premium";

/** Maps plan + billingCycle → Razorpay Plan ID from env */
const RAZORPAY_PLAN_MAP: Record<PlanKey, Record<BillingCycle, () => string>> = {
  pro: {
    monthly: () => env.RAZORPAY_PRO_MONTHLY_PLAN_ID,
    yearly: () => env.RAZORPAY_PRO_YEARLY_PLAN_ID,
  },
  premium: {
    monthly: () => env.RAZORPAY_PREMIUM_MONTHLY_PLAN_ID,
    yearly: () => env.RAZORPAY_PREMIUM_YEARLY_PLAN_ID,
  },
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

  /** Resolve the server-side Razorpay Plan ID for a given plan key + billing cycle */
  static resolvePlanId(planKey: PlanKey, billingCycle: BillingCycle): string {
    const resolver = RAZORPAY_PLAN_MAP[planKey]?.[billingCycle];
    if (!resolver) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Unsupported plan or billing cycle: ${planKey}/${billingCycle}`);
    }
    const planId = resolver();
    if (!planId) {
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        `Razorpay plan ID for ${planKey}/${billingCycle} is not configured. Add it to .env.`
      );
    }
    return planId;
  }

  /**
   * Create a Razorpay recurring subscription.
   *
   * Returns the Razorpay subscription ID + checkout details for the frontend
   * to open the Razorpay checkout modal in subscription mode.
   */
  static async createSubscription(
    userId: string,
    userRole: string,
    membershipId: string,
    planKey: PlanKey,
    billingCycle: BillingCycle
  ) {
    const plan = await Membership.findById(membershipId);
    if (!plan || !plan.isActive) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Membership plan not found or inactive.");
    }

    if (plan.price === 0) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Free plans do not require Razorpay subscription. Use the direct subscribe endpoint."
      );
    }

    const razorpayPlanId = this.resolvePlanId(planKey, billingCycle);

    console.log(`[Razorpay] Creating subscription: userId=${userId} plan=${planKey}/${billingCycle} planId=${razorpayPlanId}`);

    const razorpay = this.getInstance();

    // Razorpay Subscription: charge_at = null means charge immediately on authorization
    const razorpaySubscription = await (razorpay.subscriptions as any).create({
      plan_id: razorpayPlanId,
      total_count: billingCycle === "yearly" ? 12 : 120, // 12 yearly / 120 monthly (10 years max)
      quantity: 1,
      notify_info: {
        notify_phone: "",
        notify_email: "",
      },
      notes: {
        userId,
        membershipId: plan._id.toString(),
        userRole,
        planName: plan.name,
        planKey,
        billingCycle,
      },
    });

    console.log(`[Razorpay] Subscription created: subId=${razorpaySubscription.id}`);

    // Store a PENDING payment record tied to this subscription
    await PaymentRepository.createPayment({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      amount: plan.price * 100, // in paise
      currency: plan.currency || "INR",
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
      amount: plan.price * 100,
      currency: plan.currency || "INR",
      membership: {
        id: plan._id,
        name: plan.name,
        price: plan.price,
        durationInDays: plan.durationInDays,
      },
    };
  }

  /**
   * Verify the initial Razorpay subscription payment.
   * Called from frontend after the Razorpay checkout modal closes successfully.
   *
   * For subscriptions the signature format is: hmac(razorpay_payment_id | "|" | razorpay_subscription_id)
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

    // Idempotency: if subscription already activated, return it
    const existingSub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      providerSubscriptionId: razorpay_subscription_id,
      status: "ACTIVE",
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
    const durationDays = billingCycle === "yearly" ? 365 : plan.durationInDays || 30;

    // Expire old active subscriptions
    await MembershipRepository.expireActiveSubscriptions(userId);

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const subscription = await MembershipRepository.createSubscription({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      role: userRole,
      planName: plan.name,
      amount: plan.price,
      currency: plan.currency || "INR",
      billingCycle,
      startDate,
      endDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      status: "ACTIVE",
      autoRenew: true,
      cancelAtPeriodEnd: false,
      providerSubscriptionId: razorpay_subscription_id,
      nextBillingDate: endDate,
      lastPaymentStatus: "SUCCESS",
    } as any);

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
   * Cancel Razorpay subscription at period end (or immediately).
   * cancelAtPeriodEnd=true means the user keeps access until the current period ends.
   */
  static async cancelSubscription(
    userId: string,
    cancelAtPeriodEnd: boolean = true
  ) {
    const sub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      status: "ACTIVE",
    });

    if (!sub) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "No active Razorpay subscription found.");
    }

    if (!sub.providerSubscriptionId) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "This subscription was not created via Razorpay recurring. Use the standard cancel endpoint."
      );
    }

    const razorpay = this.getInstance();

    console.log(`[Razorpay] Cancelling subscription: subId=${sub.providerSubscriptionId} cancelAtEnd=${cancelAtPeriodEnd}`);

    // Razorpay cancel: cancelAtCycleEnd=1 means cancel at end of current billing period
    await (razorpay.subscriptions as any).cancel(
      sub.providerSubscriptionId,
      cancelAtPeriodEnd ? 1 : 0
    );

    sub.cancelAtPeriodEnd = cancelAtPeriodEnd;
    sub.autoRenew = false;
    if (!cancelAtPeriodEnd) {
      sub.status = "CANCELLED";
      sub.cancelledAt = new Date();
    }
    await sub.save();

    console.log(`[Razorpay] Subscription cancel scheduled: subId=${sub.providerSubscriptionId}`);

    return {
      message: cancelAtPeriodEnd
        ? `Auto-renewal cancelled. You'll retain access until ${sub.currentPeriodEnd.toLocaleDateString("en-IN")}.`
        : "Subscription cancelled immediately.",
      subscription: sub,
    };
  }

  /**
   * Process Razorpay subscription webhook events.
   * Called from the main webhook handler when event relates to a subscription.
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
          sub.status = "ACTIVE";
          sub.cancelAtPeriodEnd = false;
          sub.autoRenew = true;
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
        // Recurring charge succeeded — create a new payment record and extend the period
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

          // Extend subscription period
          if (subscriptionEntity.current_start && subscriptionEntity.current_end) {
            sub.currentPeriodStart = new Date(subscriptionEntity.current_start * 1000);
            sub.currentPeriodEnd = new Date(subscriptionEntity.current_end * 1000);
            sub.endDate = new Date(subscriptionEntity.current_end * 1000);
            sub.nextBillingDate = new Date(subscriptionEntity.current_end * 1000);
            sub.lastPaymentStatus = "SUCCESS";
            sub.status = "ACTIVE";
            await sub.save();
          }
        }
        break;
      }

      case "subscription.cancelled": {
        if (sub) {
          // If cancelled at period end, keep ACTIVE until period ends (the expiry sweep handles it)
          sub.cancelAtPeriodEnd = true;
          sub.autoRenew = false;
          sub.cancelledAt = new Date();
          // Don't set status=CANCELLED here — let the subscription run out
          await sub.save();
        }
        break;
      }

      case "subscription.completed":
      case "subscription.expired": {
        if (sub) {
          sub.status = "EXPIRED";
          sub.autoRenew = false;
          await sub.save();
        }
        break;
      }

      case "subscription.halted": {
        if (sub) {
          sub.status = "PAST_DUE";
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
