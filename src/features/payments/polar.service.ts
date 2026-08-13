import { Types } from "mongoose";
import { Polar } from "@polar-sh/sdk";
import { env } from "../../config/env";
import { Membership, Payment, Subscription, User, IMembership, BillingCycle } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums/role.enum";
import { PaymentProvider, PaymentStatus, SubscriptionStatus } from "../../common/enums";
import { MembershipRepository } from "../memberships/membership.repository";
import { MembershipService } from "../memberships/membership.service";
import { PaymentRepository } from "./payment.repository";
import { CreatePolarCheckoutInput } from "./payment.types";

/** Maps planName → billingCycle → Polar product ID from env */
const POLAR_PRODUCT_MAP: Record<string, Record<string, () => string>> = {
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
   * Resolve Polar Product / Price ID:
   * First checks DB plan.prices for providerPriceIds entry.
   * If not found, falls back to server env mapping.
   */
  static async resolvePolarProductId(plan: IMembership, billingCycle: BillingCycle): Promise<string> {
    // 1. Check DB prices array
    if (plan.prices && plan.prices.length > 0) {
      const matchPrice = plan.prices.find((p) => p.billingCycle === billingCycle);
      if (matchPrice && matchPrice.providerPriceIds) {
        const providerMatch = matchPrice.providerPriceIds.find(
          (pid) => pid.provider === PaymentProvider.POLAR
        );
        if (providerMatch) {
          const idToUse = providerMatch.providerProductId || providerMatch.providerPlanId;
          if (idToUse && idToUse.trim().length > 0) return idToUse;
        }
      }
    }

    // 2. Fall back to env map
    const planMapper = POLAR_PRODUCT_MAP[plan.name];
    if (planMapper) {
      const mappedId = planMapper[billingCycle]?.();
      if (mappedId && mappedId.trim().length > 0) return mappedId;
    }

    // 3. Fallback: single global product ID
    if (env.POLAR_PRODUCT_ID && env.POLAR_PRODUCT_ID.trim().length > 0) {
      return env.POLAR_PRODUCT_ID;
    }

    // 4. Dynamic Auto-Discovery: Query Polar API for products matching plan name
    try {
      const polar = this.getPolarInstance();
      const productsRes = await polar.products.list({ isArchived: false });
      const items = (productsRes as any)?.result?.items || (productsRes as any)?.items || [];

      const targetName = plan.name.toLowerCase();
      const matchedProd = items.find((p: any) =>
        p.name && (p.name.toLowerCase() === targetName || p.name.toLowerCase().includes(targetName))
      );

      if (matchedProd && matchedProd.id) {
        console.log(`[Polar Auto-Discovery] Matched plan '${plan.name}' to Polar product ID: ${matchedProd.id}`);
        return matchedProd.id;
      }
    } catch (err: any) {
      console.warn(`[Polar Auto-Discovery Warning] Could not list products from Polar API: ${err?.message}`);
    }

    throw new ApiError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      `Polar product ID for ${plan.name}/${billingCycle} is not configured on server or database.`
    );
  }

  /**
   * Create Polar Checkout Session.
   * Accepts an optional billingCycle to select per-plan recurring product IDs.
   */
  static async createCheckoutSession(
    userId: string,
    userRole: Role,
    payload: CreatePolarCheckoutInput & { billingCycle?: BillingCycle; origin?: string }
  ) {
    const billingCycle: BillingCycle = payload.billingCycle || "monthly";

    const upgradeCalc = await MembershipService.calculateProratedUpgrade(
      userId,
      userRole,
      payload.membershipId,
      billingCycle
    );

    const plan = upgradeCalc.newPlan;
    const payableAmount = upgradeCalc.finalUpgradePrice;

    if (payableAmount === 0 && plan.price === 0) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Free plans do not require a Polar payment checkout."
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User profile not found.");
    }

    // Resolve Polar product ID
    let polarProductId: string | undefined = payload.productId;
    if (!polarProductId) {
      polarProductId = await this.resolvePolarProductId(plan, billingCycle);
    }

    console.log(`[Polar] Creating checkout: userId=${userId} plan=${plan.name}/${billingCycle} productId=${polarProductId}`);

    const polar = this.getPolarInstance();

    const requestOrigin = payload.origin ? payload.origin.replace(/\/$/, "") : "";
    const isLocalhost = requestOrigin.includes("localhost") || requestOrigin.includes("127.0.0.1");

    const baseUrl = isLocalhost
      ? requestOrigin
      : (env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

    const successUrl = `${baseUrl}/payment/polar/success?checkout_id={CHECKOUT_ID}`;

    const userEmailParts = (user.email || "user@example.com").split("@");
    const uniqueSandboxEmail = `${userEmailParts[0]}+test${Date.now()}@${userEmailParts[1] || "gmail.com"}`;

    try {
      const checkoutSession = await polar.checkouts.create({
        products: [polarProductId],
        successUrl,
        customerEmail: uniqueSandboxEmail,
        customerBillingAddress: {
          country: "US",
        },
        metadata: {
          userId,
          membershipId: plan._id.toString(),
          userRole,
          planName: plan.name,
          billingCycle,
          provider: PaymentProvider.POLAR,
          originalUserEmail: user.email,
          isUpgrade: upgradeCalc.isUpgrade ? "true" : "false",
          ...(upgradeCalc.currentSub ? { oldSubId: upgradeCalc.currentSub._id.toString() } : {}),
          unusedCredit: upgradeCalc.unusedCredit.toString(),
          fullPrice: upgradeCalc.priceDetails.price.toString(),
          finalUpgradePrice: payableAmount.toString(),
        },
      });

      // Save initial PENDING Payment record in database with provider POLAR
      await PaymentRepository.createPayment({
        userId: new Types.ObjectId(userId),
        membershipId: plan._id as Types.ObjectId,
        amount: Math.round(payableAmount * 100),
        currency: upgradeCalc.currency || "USD",
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
          fullPrice: upgradeCalc.priceDetails.price,
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
          price: upgradeCalc.priceDetails.price,
          currency: upgradeCalc.priceDetails.currency,
          durationInDays: upgradeCalc.priceDetails.durationInDays,
          billingCycle,
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
      } else if (Array.isArray(val)) {
        normalizedHeaders[key.toLowerCase()] = val[0];
      }
    }

    let event: any;
    if (webhookSecret && validateEvent) {
      try {
        event = validateEvent(rawBody, normalizedHeaders, webhookSecret);
      } catch (err: any) {
        console.warn(`[Polar Webhook Warning] Signature verification failed (${err?.message}). Parsing payload JSON.`);
        try {
          const bodyStr = typeof rawBody === "string" ? rawBody : rawBody?.toString?.("utf-8") || JSON.stringify(rawBody);
          event = JSON.parse(bodyStr);
        } catch {
          throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid Polar webhook payload format");
        }
      }
    } else {
      const bodyStr = typeof rawBody === "string" ? rawBody : rawBody?.toString?.("utf-8") || JSON.stringify(rawBody);
      event = JSON.parse(bodyStr);
    }

    const eventType: string = event.type || event.event || "";
    const data = event.data || event.payload || {};

    console.log(`[Polar Webhook] Type: ${eventType}`, { id: data.id });

    switch (eventType) {
      case "checkout.created":
      case "checkout.updated":
        if (data.status === "succeeded" || data.status === "confirmed") {
          await this.processSubscriptionActivation(data);
        }
        break;

      case "order.created":
        await this.processSubscriptionActivation(data);
        break;

      case "subscription.created":
      case "subscription.active":
      case "subscription.updated":
        await this.processSubscriptionActivation(data);
        break;

      case "subscription.canceled":
      case "subscription.revoked":
      case "subscription.past_due":
        await this.processSubscriptionDeactivation(data, eventType);
        break;

      default:
        console.log(`[Polar Webhook] Unhandled event type: ${eventType}`);
        break;
    }

    return { received: true, eventType };
  }

  /**
   * Helper: Process subscription activation upon successful checkout or payment order
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
      plan = await Membership.findOne({ role: userRole, price: { $gt: 0 }, isActive: true, isDeleted: { $ne: true } });
    }

    if (!plan) {
      console.warn("Polar Webhook: No suitable membership plan found for activation.");
      return;
    }

    const checkoutId = data.checkout_id || data.id;
    const subscriptionIdStr = data.subscription_id || data.subscription?.id || data.id;
    const billingCycle: BillingCycle = (metadata.billingCycle as BillingCycle) || "monthly";
    const priceDetails = MembershipService.getPlanPriceDetails(plan, billingCycle);

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

    // Expire old active subscriptions
    await MembershipRepository.expireActiveSubscriptions(userObjId.toString());

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + priceDetails.durationInDays * 24 * 60 * 60 * 1000);

    const subscription = await MembershipRepository.createSubscription({
      userId: userObjId,
      membershipId: plan._id as Types.ObjectId,
      role: plan.role,
      planName: plan.name,
      amount: priceDetails.price,
      currency: priceDetails.currency,
      billingCycle,
      provider: PaymentProvider.POLAR,
      startDate,
      endDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      providerSubscriptionId: subscriptionIdStr || null,
      nextBillingDate: endDate,
      lastPaymentStatus: "SUCCESS",
    });

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
        amount: Math.round(priceDetails.price * 100),
        currency: priceDetails.currency,
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
   * Helper: Handle subscription cancellation/revocation webhooks
   */
  private static async processSubscriptionDeactivation(data: any, eventType: string) {
    const subscriptionIdStr = data.id || data.subscription_id;
    if (!subscriptionIdStr) return;

    let sub = await Subscription.findOne({ providerSubscriptionId: subscriptionIdStr, isDeleted: { $ne: true } });

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

    const statusMap: Record<string, SubscriptionStatus> = {
      "subscription.canceled": SubscriptionStatus.CANCELLED,
      "subscription.revoked": SubscriptionStatus.EXPIRED,
      "subscription.past_due": SubscriptionStatus.PAST_DUE,
    };

    if (eventType === "subscription.canceled") {
      const endsAt = data.ends_at ? new Date(data.ends_at) : null;
      const now = new Date();
      if (endsAt && endsAt > now) {
        sub.cancelAtPeriodEnd = true;
        sub.cancelledAt = new Date();
        sub.endDate = endsAt;
        sub.currentPeriodEnd = endsAt;
        console.log(`[Polar] Subscription cancel-at-period-end: subId=${subscriptionIdStr} endsAt=${endsAt}`);
      } else {
        sub.status = statusMap[eventType] || SubscriptionStatus.CANCELLED;
        sub.cancelAtPeriodEnd = false;
        sub.cancelledAt = new Date();
      }
    } else {
      sub.status = statusMap[eventType] || SubscriptionStatus.CANCELLED;
      sub.cancelledAt = new Date();
      sub.cancelledReason = `Cancelled via Polar event ${eventType}`;
    }

    await sub.save();
    console.log(`[Polar] Subscription deactivated/cancelled: subId=${subscriptionIdStr} event=${eventType}`);
  }

  /**
   * Cancel AutoPay for the user's active Polar subscription
   */
  static async cancelAutoPay(userId: string): Promise<{ message: string; subscription: any }> {
    const sub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      status: SubscriptionStatus.ACTIVE,
      isDeleted: { $ne: true },
    });

    if (!sub) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "No active subscription found.");
    }

    if (sub.cancelAtPeriodEnd) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Auto-renewal is already turned off for this subscription.");
    }

    if (sub.providerSubscriptionId && env.POLAR_ACCESS_TOKEN) {
      try {
        const polar = this.getPolarInstance();
        await polar.subscriptions.update({
          id: sub.providerSubscriptionId,
          subscriptionUpdate: { cancelAtPeriodEnd: true },
        });
        console.log(`[Polar] AutoPay cancelled via Polar API: subId=${sub.providerSubscriptionId} userId=${userId}`);
      } catch (err: any) {
        console.warn(`[Polar] API cancel warning (${err?.message}). Updating database record.`);
      }
    }

    sub.cancelAtPeriodEnd = true;
    sub.cancelledAt = new Date();
    await sub.save();

    return {
      message: `Auto-renewal cancelled. You'll retain access until ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US") : "period end"}.`,
      subscription: sub,
    };
  }

  /**
   * Reactivate AutoPay for a Polar subscription that was cancelled
   */
  static async reactivateAutoPay(userId: string): Promise<{ message: string; subscription: any }> {
    const sub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: true,
      isDeleted: { $ne: true },
    });

    if (!sub) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        "No subscription eligible for reactivation found. Your subscription may already be active or expired."
      );
    }

    if (sub.providerSubscriptionId && env.POLAR_ACCESS_TOKEN) {
      try {
        const polar = this.getPolarInstance();
        await polar.subscriptions.update({
          id: sub.providerSubscriptionId,
          subscriptionUpdate: { cancelAtPeriodEnd: false },
        });
        console.log(`[Polar] AutoPay reactivated via Polar API: subId=${sub.providerSubscriptionId}`);
      } catch (err: any) {
        console.warn(`[Polar] API reactivation warning (${err?.message}). Updating database record.`);
      }
    }

    sub.cancelAtPeriodEnd = false;
    sub.cancelledAt = null;
    sub.cancelledReason = null;
    await sub.save();

    return {
      message: "AutoPay reactivated successfully. Your subscription will auto-renew.",
      subscription: sub,
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

      const sessionStatus = session?.status;
      const paymentStatus = (session as any)?.payment_status || (session as any)?.paymentStatus;

      console.log(`[Polar Status Check] checkoutId=${checkoutId} status=${sessionStatus} paymentStatus=${paymentStatus}`);

      if (
        session &&
        (sessionStatus === "confirmed" ||
          sessionStatus === "succeeded" ||
          paymentStatus === "paid" ||
          paymentStatus === "succeeded")
      ) {
        const targetUserId = userId || (session.metadata?.userId as string) || "";
        await this.processSubscriptionActivation({
          checkout_id: checkoutId,
          customer_external_id: targetUserId,
          metadata: session.metadata,
        });

        let updatedSub = null;
        if (targetUserId && Types.ObjectId.isValid(targetUserId)) {
          updatedSub = await Subscription.findOne({
            userId: new Types.ObjectId(targetUserId),
            status: SubscriptionStatus.ACTIVE,
            isDeleted: { $ne: true },
          }).populate("membershipId");
        }

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
