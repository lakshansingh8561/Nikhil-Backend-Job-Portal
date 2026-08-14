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
    monthly: () => env.POLAR_RECRUITER_PROFESSIONAL_PRODUCT_ID,
    yearly: () => env.POLAR_RECRUITER_PROFESSIONAL_PRODUCT_ID,
  },
  Premium: {
    monthly: () => env.POLAR_PREMIUM_MONTHLY_PRODUCT_ID,
    yearly: () => env.POLAR_PREMIUM_YEARLY_PRODUCT_ID,
  },
  Enterprise: {
    monthly: () => env.POLAR_RECRUITER_ENTERPRISE_PRODUCT_ID,
    yearly: () => env.POLAR_RECRUITER_ENTERPRISE_PRODUCT_ID,
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
  static getPolarInstance(): Polar {
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

    // 2. Fall back to env map (case-insensitive & alias lookup)
    const normalizedPlanName = (plan.name || "").trim().toLowerCase();
    const mapKey = Object.keys(POLAR_PRODUCT_MAP).find(
      (k) => k.toLowerCase() === normalizedPlanName || normalizedPlanName.includes(k.toLowerCase())
    );

    if (mapKey && POLAR_PRODUCT_MAP[mapKey]) {
      const mappedId = POLAR_PRODUCT_MAP[mapKey][billingCycle]?.() || POLAR_PRODUCT_MAP[mapKey]["monthly"]?.();
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
  static async processSubscriptionActivation(data: any) {
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

    const startDate = new Date();
    const polarEndRaw = data.current_period_end || data.currentPeriodEnd || data.ends_at || data.endsAt;
    const endDate = polarEndRaw
      ? new Date(polarEndRaw)
      : MembershipService.calculateSubscriptionEndDate(startDate, billingCycle);

    // Check if subscription already exists for this providerSubscriptionId
    let subscription: any = await Subscription.findOne({
      provider: PaymentProvider.POLAR,
      providerSubscriptionId: subscriptionIdStr,
    });

    if (subscription) {
      // Gracefully activate existing subscription
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.membershipId = plan._id as Types.ObjectId;
      subscription.planName = plan.name;
      subscription.amount = priceDetails.price;
      subscription.startDate = startDate;
      subscription.endDate = endDate;
      subscription.currentPeriodStart = startDate;
      subscription.currentPeriodEnd = endDate;
      subscription.cancelAtPeriodEnd = false;
      await subscription.save();
    } else {
      // Expire old active subscriptions
      await MembershipRepository.expireActiveSubscriptions(userObjId.toString());

      try {
        subscription = await MembershipRepository.createSubscription({
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
      } catch (subErr: any) {
        subscription = await Subscription.findOne({
          provider: PaymentProvider.POLAR,
          providerSubscriptionId: subscriptionIdStr,
        });
        if (subscription) {
          subscription.status = SubscriptionStatus.ACTIVE;
          subscription.save();
        }
      }
    }

    if (!subscription) return;

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

    // Strict matching: Only deactivate the exact subscription with this providerSubscriptionId
    const sub = await Subscription.findOne({
      provider: PaymentProvider.POLAR,
      providerSubscriptionId: subscriptionIdStr,
      isDeleted: { $ne: true },
    });

    if (!sub) {
      console.warn(`[Polar Webhook Warning] No matching subscription found for ID ${subscriptionIdStr}. Skipping deactivation.`);
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

    if (!sub.providerSubscriptionId) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "No provider subscription ID associated with this plan.");
    }

    if (!env.POLAR_ACCESS_TOKEN) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "POLAR_ACCESS_TOKEN is missing in environment variables.");
    }

    // Call Polar API: PATCH https://sandbox-api.polar.sh/v1/subscriptions/{id} with cancel_at_period_end = true
    try {
      const polar = this.getPolarInstance();
      await polar.subscriptions.update({
        id: sub.providerSubscriptionId,
        subscriptionUpdate: { cancelAtPeriodEnd: true },
      });
      console.log(`[Polar] API cancel_at_period_end success: subId=${sub.providerSubscriptionId} userId=${userId}`);
    } catch (err: any) {
      const errMsg = err?.body || err?.rawMessage || err?.message || JSON.stringify(err);
      console.error(`[Polar API Error] Failed to update subscription on Polar:`, errMsg);

      if (String(errMsg).includes("AlreadyCanceledSubscription")) {
        console.log(`[Polar] Subscription ${sub.providerSubscriptionId} is already scheduled for period end cancellation in Polar Sandbox.`);
      } else if (String(errMsg).includes("insufficient_scope") || String(errMsg).includes("subscriptions:write")) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          "Polar API Cancellation Error: POLAR_ACCESS_TOKEN in backend/.env lacks 'subscriptions:write' scope. Please update token scopes in Polar Sandbox Dashboard."
        );
      } else {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          `Polar API Cancellation Error: ${err?.message || "Failed to cancel subscription on Polar."}`
        );
      }
    }

    // Update MongoDB database record after Polar API succeeds
    sub.cancelAtPeriodEnd = true;
    sub.cancelledAt = new Date();
    await sub.save();

    const formattedEndDate = sub.currentPeriodEnd || sub.endDate
      ? new Date(sub.currentPeriodEnd || sub.endDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
      : "period end";

    return {
      message: `AutoPay cancelled successfully. Access retained until ${formattedEndDate}.`,
      subscription: sub,
    };
  }

  /**
   * Reactivate AutoPay for a Polar subscription that was cancelled
   */
  static async reactivateAutoPay(userId: string): Promise<{ message: string; subscription: any }> {
    let sub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      provider: PaymentProvider.POLAR,
      isDeleted: { $ne: true },
    }).sort({ createdAt: -1 });

    // Fallback: If DB subscription is not ACTIVE, check if an active subscription exists in Polar Cloud
    if (!sub || sub.status !== SubscriptionStatus.ACTIVE) {
      if (env.POLAR_ACCESS_TOKEN) {
        try {
          const user = await User.findById(userId);
          const polar = this.getPolarInstance();
          const subsList = await polar.subscriptions.list({ limit: 20 });
          const items = (subsList as any)?.result?.items || (subsList as any)?.items || [];

          const matchingSub = items.find((s: any) =>
            (s.status === "active" || s.status === "succeeded") &&
            (s.metadata?.userId === userId ||
              (user && s.customer?.email === user.email) ||
              (user && s.customer?.email?.startsWith(`${user.email.split('@')[0]}+`)))
          );

          if (matchingSub) {
            await this.processSubscriptionActivation({
              checkout_id: matchingSub.id,
              customer_external_id: userId,
              subscription_id: matchingSub.id,
              metadata: matchingSub.metadata,
            });

            sub = await Subscription.findOne({
              userId: new Types.ObjectId(userId),
              provider: PaymentProvider.POLAR,
              isDeleted: { $ne: true },
            }).sort({ createdAt: -1 });
          }
        } catch (polarErr) {
          console.warn("[Polar] Fallback error syncing active sub for reactivation:", polarErr);
        }
      }
    }

    if (!sub) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        "No subscription eligible for reactivation found."
      );
    }

    if (!sub.providerSubscriptionId) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "No provider subscription ID associated with this plan.");
    }

    if (!env.POLAR_ACCESS_TOKEN) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "POLAR_ACCESS_TOKEN is missing in environment variables.");
    }

    // Call Polar API: PATCH https://sandbox-api.polar.sh/v1/subscriptions/{id} with cancel_at_period_end = false
    try {
      const polar = this.getPolarInstance();
      await polar.subscriptions.update({
        id: sub.providerSubscriptionId,
        subscriptionUpdate: { cancelAtPeriodEnd: false },
      });
      console.log(`[Polar] API reactivate (cancel_at_period_end = false) success: subId=${sub.providerSubscriptionId}`);
    } catch (err: any) {
      const errMsg = err?.body || err?.rawMessage || err?.message || JSON.stringify(err);
      console.error(`[Polar API Error] Failed to reactivate subscription on Polar:`, errMsg);

      if (String(errMsg).includes("insufficient_scope") || err?.statusCode === 403 || String(errMsg).includes("subscriptions:write")) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          "Polar API Reactivation Error: POLAR_ACCESS_TOKEN in backend/.env lacks 'subscriptions:write' scope."
        );
      }

      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `Polar API Reactivation Error: ${err?.message || "Failed to reactivate subscription on Polar."}`
      );
    }

    sub.status = SubscriptionStatus.ACTIVE;
    sub.cancelAtPeriodEnd = false;
    sub.cancelledAt = null;
    sub.cancelledReason = null;
    await sub.save();

    return {
      message: "Recruiter AutoPay reactivated! Your subscription will auto-renew 🎉",
      subscription: sub,
    };
  }

  /**
   * Get Polar Checkout Session Status for frontend polling
   */
  static async getCheckoutStatus(checkoutId: string, userId: string) {
    if (userId && Types.ObjectId.isValid(userId)) {
      const existingSub = await Subscription.findOne({
        userId: new Types.ObjectId(userId),
        status: SubscriptionStatus.ACTIVE,
        isDeleted: { $ne: true },
      }).populate("membershipId");

      if (existingSub) {
        return {
          status: "COMPLETED",
          isActivated: true,
          subscription: existingSub,
        };
      }
    }

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
          sessionStatus === "open" ||
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
      if (userId && Types.ObjectId.isValid(userId)) {
        const fallbackSub = await Subscription.findOne({
          userId: new Types.ObjectId(userId),
          status: SubscriptionStatus.ACTIVE,
          isDeleted: { $ne: true },
        }).populate("membershipId");

        if (fallbackSub) {
          return {
            status: "COMPLETED",
            isActivated: true,
            subscription: fallbackSub,
          };
        }

        try {
          const user = await User.findById(userId);
          const polar = this.getPolarInstance();
          const subsList = await polar.subscriptions.list({ limit: 10 });
          const items = (subsList as any)?.result?.items || (subsList as any)?.items || [];

          const matchingSub = items.find((s: any) =>
            s.metadata?.userId === userId ||
            (user && s.customer?.email === user.email) ||
            (user && s.customer?.email?.startsWith(`${user.email.split('@')[0]}+`))
          );

          if (matchingSub && (matchingSub.status === "active" || matchingSub.status === "succeeded")) {
            await this.processSubscriptionActivation({
              checkout_id: checkoutId,
              customer_external_id: userId,
              subscription_id: matchingSub.id,
              metadata: matchingSub.metadata,
            });

            const activatedSub = await Subscription.findOne({
              userId: new Types.ObjectId(userId),
              status: SubscriptionStatus.ACTIVE,
              isDeleted: { $ne: true },
            }).populate("membershipId");

            if (activatedSub) {
              return {
                status: "COMPLETED",
                isActivated: true,
                subscription: activatedSub,
              };
            }
          }
        } catch (polarErr) {
          console.warn("[Polar] Fallback status check warning:", (polarErr as any)?.message);
        }
      }

      return {
        status: payment ? payment.status : "PENDING",
        isActivated: payment?.status === PaymentStatus.SUCCESS,
      };
    }
  }
}
