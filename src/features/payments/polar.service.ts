import { Types } from "mongoose";
import { Polar } from "@polar-sh/sdk";
import { env } from "../../config/env";
import { Membership, Payment, Subscription, User } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums/role.enum";
import { PaymentProvider, PaymentStatus } from "../../common/enums";
import { MembershipRepository } from "../memberships/membership.repository";
import { MembershipService } from "../memberships/membership.service";
import { PaymentRepository } from "./payment.repository";
import { CreatePolarCheckoutInput } from "./payment.types";

export type BillingCycle = "monthly" | "yearly";

/** Maps planName → billingCycle → Polar product ID from env */
const POLAR_PRODUCT_MAP: Record<string, Record<BillingCycle, () => string>> = {
  Pro: {
    monthly: () => env.POLAR_PRO_MONTHLY_PRODUCT_ID,
    yearly: () => env.POLAR_PRO_YEARLY_PRODUCT_ID,
  },
  Professional: {
    monthly: () => env.POLAR_PRO_MONTHLY_PRODUCT_ID,
    yearly: () => env.POLAR_PRO_YEARLY_PRODUCT_ID,
  },
  Premium: {
    monthly: () => env.POLAR_PREMIUM_MONTHLY_PRODUCT_ID,
    yearly: () => env.POLAR_PREMIUM_YEARLY_PRODUCT_ID,
  },
  Enterprise: {
    monthly: () => env.POLAR_PREMIUM_MONTHLY_PRODUCT_ID,
    yearly: () => env.POLAR_PREMIUM_YEARLY_PRODUCT_ID,
  },
};

// Import Webhook helpers safely with fallback
let validateEvent: any;
let WebhookVerificationError: any;
try {
  const webhooksModule = require("@polar-sh/sdk/webhooks.js");
  validateEvent = webhooksModule.validateEvent;
  WebhookVerificationError = webhooksModule.WebhookVerificationError;
} catch (e) {
  // Fallback if required
}

export class PolarService {
  private static getPolarInstance(): Polar {
    if (!env.POLAR_ACCESS_TOKEN) {
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "POLAR_ACCESS_TOKEN is not configured on the server."
      );
    }

    return new Polar({
      accessToken: env.POLAR_ACCESS_TOKEN,
      server: (env.POLAR_SERVER as any) || "sandbox",
    });
  }

  /**
   * Create Polar Checkout Session.
   * Accepts an optional billingCycle to select per-plan recurring product IDs.
   */
  static async createCheckoutSession(
    userId: string,
    userRole: Role,
    payload: CreatePolarCheckoutInput & { billingCycle?: BillingCycle }
  ) {
    const upgradeCalc = await MembershipService.calculateProratedUpgrade(
      userId,
      userRole,
      payload.membershipId
    );

    const plan = upgradeCalc.newPlan;
    const payableAmount = upgradeCalc.finalUpgradePrice;

    if (plan.price === 0) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Free plans do not require a Polar payment checkout."
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User profile not found.");
    }

    const billingCycle: BillingCycle = payload.billingCycle || "monthly";

    // Resolve Polar product ID: per-plan product IDs take priority over legacy single product ID
    let polarProductId: string | undefined = payload.productId;
    if (!polarProductId) {
      const planMapper = POLAR_PRODUCT_MAP[plan.name];
      if (planMapper) {
        polarProductId = planMapper[billingCycle]?.();
      }
      // Fallback: legacy single product ID
      if (!polarProductId) {
        polarProductId = env.POLAR_PRODUCT_ID;
      }
    }

    if (!polarProductId) {
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        `Polar product ID for ${plan.name}/${billingCycle} is not configured. Add POLAR_${plan.name.toUpperCase()}_${billingCycle.toUpperCase()}_PRODUCT_ID to .env.`
      );
    }

    console.log(`[Polar] Creating checkout: userId=${userId} plan=${plan.name}/${billingCycle} productId=${polarProductId}`);

    const polar = this.getPolarInstance();
    const successUrl = `${env.FRONTEND_URL}/payment/polar/success?checkout_id={CHECKOUT_ID}`;

    const userEmailParts = (user.email || "user@example.com").split("@");
    const uniqueSandboxEmail = `${userEmailParts[0]}+test${Date.now()}@${userEmailParts[1] || "gmail.com"}`;

    try {
      const checkoutSession = await polar.checkouts.create({
        products: [polarProductId],
        successUrl,
        customerEmail: uniqueSandboxEmail,
        metadata: {
          userId,
          membershipId: plan._id.toString(),
          userRole,
          planName: plan.name,
          billingCycle,
          provider: "POLAR",
          originalUserEmail: user.email,
          isUpgrade: upgradeCalc.isUpgrade ? "true" : "false",
          ...(upgradeCalc.currentSub ? { oldSubId: upgradeCalc.currentSub._id.toString() } : {}),
          unusedCredit: upgradeCalc.unusedCredit.toString(),
          fullPrice: plan.price.toString(),
          finalUpgradePrice: payableAmount.toString(),
        },
      });

      // Save initial PENDING Payment record in database with provider POLAR
      await PaymentRepository.createPayment({
        userId: new Types.ObjectId(userId),
        membershipId: plan._id as Types.ObjectId,
        amount: Math.round(payableAmount * 100),
        currency: plan.currency || "USD",
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.POLAR,
        providerPaymentId: checkoutSession.id,
        providerOrderId: checkoutSession.id,
        providerData: {
          polarCheckoutId: checkoutSession.id,
          polarProductId,
          billingCycle,
          checkoutUrl: checkoutSession.url,
        },
        metadata: {
          isUpgrade: upgradeCalc.isUpgrade,
          oldSubId: upgradeCalc.currentSub ? upgradeCalc.currentSub._id.toString() : null,
          unusedCredit: upgradeCalc.unusedCredit,
          fullPrice: plan.price,
          finalUpgradePrice: payableAmount,
          billingCycle,
        },
      });

      console.log(`[Polar] Checkout created: checkoutId=${checkoutSession.id}`);

      return {
        checkoutId: checkoutSession.id,
        checkoutUrl: checkoutSession.url,
        plan: {
          id: plan._id,
          name: plan.name,
          price: plan.price,
          currency: plan.currency,
          durationInDays: plan.durationInDays,
        },
      };
    } catch (err: unknown) {
      console.error("Polar Checkout Creation Error:", err);
      const errMsg = (err as any)?.message || "Failed to create Polar checkout session.";
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, errMsg);
    }
  }

  /**
   * Idempotent Polar Webhook Handler
   */
  static async handleWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ) {
    const webhookSecret = env.POLAR_WEBHOOK_SECRET;

    const normalizedHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(headers)) {
      if (typeof val === "string") {
        normalizedHeaders[key.toLowerCase()] = val;
      } else if (Array.isArray(val) && val[0]) {
        normalizedHeaders[key.toLowerCase()] = val[0];
      }
    }

    let event: any;
    if (webhookSecret && validateEvent) {
      try {
        event = validateEvent(rawBody.toString(), normalizedHeaders, webhookSecret);
      } catch (err: unknown) {
        if (WebhookVerificationError && err instanceof WebhookVerificationError) {
          throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Polar Webhook Verification Failed: ${(err as Error).message}`);
        }
        console.warn("Polar Webhook Verification Warning:", (err as Error)?.message || err);
        event = JSON.parse(rawBody.toString());
      }
    } else {
      event = JSON.parse(rawBody.toString());
    }

    const eventType = event.type || event.event;
    const data = event.data || event.payload || event;

    if (
      eventType === "order.created" ||
      eventType === "order.paid" ||
      eventType === "checkout.created" ||
      eventType === "checkout.updated" ||
      eventType === "subscription.created" ||
      eventType === "subscription.active" ||
      eventType === "subscription.updated"
    ) {
      await this.processSubscriptionActivation(data);
    } else if (
      eventType === "subscription.canceled" ||
      eventType === "subscription.revoked" ||
      eventType === "subscription.past_due"
    ) {
      await this.processSubscriptionDeactivation(data, eventType);
    }

    return { success: true, message: `Polar Webhook event '${eventType}' processed successfully` };
  }

  /**
   * Helper: Activate User Membership upon successful Polar event
   */
  private static async processSubscriptionActivation(data: any) {
    const metadata = data.metadata || data.checkout?.metadata || {};
    const userId = metadata.userId || data.customer?.external_id || data.customer_external_id;
    const membershipId = metadata.membershipId;

    let userObjId: Types.ObjectId | null = null;
    if (userId && Types.ObjectId.isValid(userId)) {
      userObjId = new Types.ObjectId(userId);
    } else if (data.customer?.email || data.customer_email) {
      const email = data.customer?.email || data.customer_email;
      const foundUser = await User.findOne({ email });
      if (foundUser) userObjId = foundUser._id as Types.ObjectId;
    }

    if (!userObjId) {
      console.warn("Polar Webhook: Could not locate user for activation", data);
      return;
    }

    let plan: any = null;
    if (membershipId && Types.ObjectId.isValid(membershipId)) {
      plan = await Membership.findById(membershipId);
    }

    if (!plan) {
      const user = await User.findById(userObjId);
      const userRole = user?.role || Role.JOB_SEEKER;
      plan = await Membership.findOne({ role: userRole, price: { $gt: 0 }, isActive: true });
    }

    if (!plan) {
      console.warn("Polar Webhook: No suitable membership plan found for activation.");
      return;
    }

    const checkoutId = data.checkout_id || data.id;
    const subscriptionIdStr = data.subscription_id || data.subscription?.id || data.id;

    const existingPayment = await Payment.findOne({
      provider: PaymentProvider.POLAR,
      $or: [
        { providerPaymentId: checkoutId },
        { providerOrderId: checkoutId },
        { providerSubscriptionId: subscriptionIdStr },
      ],
      status: PaymentStatus.SUCCESS,
    });

    if (existingPayment) {
      return;
    }

    await MembershipRepository.expireActiveSubscriptions(userObjId.toString());

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationInDays * 24 * 60 * 60 * 1000);

    const subscription = await MembershipRepository.createSubscription({
      userId: userObjId,
      membershipId: plan._id as Types.ObjectId,
      role: plan.role,
      planName: plan.name,
      amount: plan.price,
      currency: plan.currency || "USD",
      billingCycle: (metadata.billingCycle as BillingCycle) || "monthly",
      startDate,
      endDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      status: "ACTIVE",
      autoRenew: true,
      cancelAtPeriodEnd: false,
      providerSubscriptionId: subscriptionIdStr || null,
      nextBillingDate: endDate,
      lastPaymentStatus: "SUCCESS",
    } as any);

    let payment = await Payment.findOne({
      provider: PaymentProvider.POLAR,
      $or: [
        { providerPaymentId: checkoutId },
        { providerOrderId: checkoutId },
        { userId: userObjId, status: PaymentStatus.PENDING },
      ],
    });

    if (!payment) {
      payment = new Payment({
        userId: userObjId,
        membershipId: plan._id,
        amount: Math.round(plan.price * 100),
        currency: plan.currency || "USD",
        status: PaymentStatus.SUCCESS,
        provider: PaymentProvider.POLAR,
        providerPaymentId: checkoutId,
        providerOrderId: checkoutId,
        providerSubscriptionId: subscriptionIdStr,
        subscriptionId: subscription._id,
        paidAt: new Date(),
        providerData: data,
      });
    } else {
      payment.status = PaymentStatus.SUCCESS;
      payment.providerPaymentId = checkoutId;
      payment.providerSubscriptionId = subscriptionIdStr;
      payment.subscriptionId = subscription._id as Types.ObjectId;
      payment.paidAt = new Date();
      payment.providerData = data;
    }

    await payment.save();
  }

  /**
   * Helper: Handle subscription.canceled webhook.
   * Polar's cancel_at_period_end: if endsAt is in future, keep ACTIVE but set cancelAtPeriodEnd=true.
   */
  private static async processSubscriptionDeactivation(data: any, eventType: string) {
    const subscriptionIdStr = data.id || data.subscription_id;
    if (!subscriptionIdStr) return;

    // Find subscription by providerSubscriptionId first, then by payment record
    let sub = await Subscription.findOne({ providerSubscriptionId: subscriptionIdStr });

    if (!sub) {
      const payment = await Payment.findOne({
        provider: PaymentProvider.POLAR,
        providerSubscriptionId: subscriptionIdStr,
      });
      if (payment?.subscriptionId) {
        sub = await Subscription.findById(payment.subscriptionId);
      }
    }

    if (!sub) {
      console.warn(`[Polar] Webhook: No subscription found for deactivation: ${subscriptionIdStr}`);
      return;
    }

    const statusMap: Record<string, "CANCELLED" | "EXPIRED" | "PAST_DUE"> = {
      "subscription.canceled": "CANCELLED",
      "subscription.revoked": "EXPIRED",
      "subscription.past_due": "PAST_DUE",
    };

    // For canceled: if endsAt is in the future, use cancelAtPeriodEnd behaviour (keep ACTIVE until period end)
    if (eventType === "subscription.canceled") {
      const endsAt = data.ends_at ? new Date(data.ends_at) : null;
      const now = new Date();
      if (endsAt && endsAt > now) {
        // User cancelled but still has access until period ends
        sub.cancelAtPeriodEnd = true;
        sub.autoRenew = false;
        sub.cancelledAt = new Date();
        // Keep status ACTIVE — expiry sweep will EXPIRE it once endsAt passes
        if (endsAt) {
          sub.endDate = endsAt;
          sub.currentPeriodEnd = endsAt;
        }
        console.log(`[Polar] Subscription cancel-at-period-end: subId=${subscriptionIdStr} endsAt=${endsAt}`);
      } else {
        sub.status = statusMap[eventType] || "CANCELLED";
        sub.autoRenew = false;
        sub.cancelAtPeriodEnd = false;
        sub.cancelledAt = new Date();
      }
    } else {
      sub.status = statusMap[eventType] || "CANCELLED";
      sub.autoRenew = false;
      sub.cancelledAt = new Date();
      sub.cancelledReason = `Cancelled via Polar event ${eventType}`;
    }

    await sub.save();
    console.log(`[Polar] Subscription deactivated/cancelled: subId=${subscriptionIdStr} event=${eventType}`);
  }

  /**
   * Cancel AutoPay for the user's active Polar subscription (at period end).
   * Called from the Cancel AutoPay endpoint.
   */
  static async cancelAutoPay(userId: string): Promise<{ message: string; subscription: any }> {
    const sub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      status: "ACTIVE",
    });

    if (!sub) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "No active subscription found.");
    }

    if (sub.cancelAtPeriodEnd) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Auto-renewal is already turned off for this subscription.");
    }

    // Cancel via Polar API if we have a subscription ID
    if (sub.providerSubscriptionId && env.POLAR_ACCESS_TOKEN) {
      try {
        const polar = this.getPolarInstance();
        // Polar SDK: cancel a subscription
        await (polar.subscriptions as any).cancel({ id: sub.providerSubscriptionId });
        console.log(`[Polar] AutoPay cancelled: subId=${sub.providerSubscriptionId} userId=${userId}`);
      } catch (err: any) {
        console.warn(`[Polar] Failed to cancel via API: ${err?.message}. Falling back to DB-only cancel.`);
      }
    }

    sub.cancelAtPeriodEnd = true;
    sub.autoRenew = false;
    sub.cancelledAt = new Date();
    await sub.save();

    return {
      message: `Auto-renewal cancelled. You'll retain access until ${sub.currentPeriodEnd.toLocaleDateString("en-IN")}.`,
      subscription: sub,
    };
  }

  /**
   * Reactivate AutoPay for a Polar subscription that was cancelled but hasn't expired yet.
   * NOTE: Polar does not support reactivating a cancelled subscription via API (v0.49).
   * We update local DB and inform the user they need to re-subscribe after expiry if Polar declines.
   */
  static async reactivateAutoPay(userId: string): Promise<{ message: string; subscription: any; requiresNewCheckout?: boolean }> {
    const sub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      status: "ACTIVE",
      cancelAtPeriodEnd: true,
    });

    if (!sub) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        "No subscription eligible for reactivation found. Your subscription may already be active or expired."
      );
    }

    // Try Polar API reactivation — not officially supported in v0.49, so gracefully fall back
    let apiSuccess = false;
    if (sub.providerSubscriptionId && env.POLAR_ACCESS_TOKEN) {
      try {
        const polar = this.getPolarInstance();
        // Attempt to update subscription — behavior varies by Polar version
        await (polar.subscriptions as any).update({
          id: sub.providerSubscriptionId,
          subscriptionUpdate: { cancelAtPeriodEnd: false },
        });
        apiSuccess = true;
        console.log(`[Polar] AutoPay reactivated via API: subId=${sub.providerSubscriptionId}`);
      } catch (err: any) {
        console.warn(`[Polar] Reactivation via API not supported: ${err?.message}`);
      }
    }

    if (apiSuccess) {
      sub.cancelAtPeriodEnd = false;
      sub.autoRenew = true;
      sub.cancelledAt = null;
      await sub.save();
      return { message: "Auto-renewal reactivated successfully.", subscription: sub };
    }

    // Polar does not support reactivation — inform user to re-subscribe
    return {
      message: "Polar does not support reactivating a cancelled subscription. You'll retain access until the period ends. Please subscribe again after expiry.",
      subscription: sub,
      requiresNewCheckout: true,
    };
  }

  /**
   * Get Polar Checkout Session Status for frontend polling
   */
  static async getCheckoutStatus(checkoutId: string, userId: string) {
    const payment = await Payment.findOne({
      provider: PaymentProvider.POLAR,
      $or: [
        { providerPaymentId: checkoutId },
        { providerOrderId: checkoutId },
      ],
    }).populate("subscriptionId");

    if (payment && payment.status === PaymentStatus.SUCCESS) {
      return {
        status: "COMPLETED",
        isActivated: true,
        payment,
        subscription: payment.subscriptionId,
      };
    }

    try {
      const polar = this.getPolarInstance();
      const session = await polar.checkouts.get({ id: checkoutId });

      if (session && (session.status === "confirmed" || session.status === "succeeded")) {
        await this.processSubscriptionActivation({
          checkout_id: checkoutId,
          customer_external_id: userId,
          metadata: session.metadata,
        });

        const updatedSub = await Subscription.findOne({
          userId: new Types.ObjectId(userId),
          status: "ACTIVE",
        }).populate("membershipId");

        return {
          status: "COMPLETED",
          isActivated: true,
          subscription: updatedSub,
        };
      }

      return {
        status: session?.status || "PENDING",
        isActivated: false,
      };
    } catch (err: unknown) {
      return {
        status: payment ? payment.status : "PENDING",
        isActivated: payment?.status === PaymentStatus.SUCCESS,
      };
    }
  }
}
