import { Types } from "mongoose";
import { Polar } from "@polar-sh/sdk";
import { env } from "../../config/env";
import { Membership, Payment, Subscription, User } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums/role.enum";
import { MembershipRepository } from "../memberships/membership.repository";
import { PaymentRepository } from "./payment.repository";
import { CreatePolarCheckoutInput } from "./payment.types";

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

    console.log("Polar server:", env.POLAR_SERVER || "sandbox");
    console.log("Polar product configured:", Boolean(env.POLAR_PRODUCT_ID));
    console.log("Polar token configured:", Boolean(env.POLAR_ACCESS_TOKEN));

    return new Polar({
      accessToken: env.POLAR_ACCESS_TOKEN,
      server: env.POLAR_SERVER || "sandbox",
    });
  }

  /**
   * Create Polar Sandbox Checkout Session
   */
  static async createCheckoutSession(
    userId: string,
    userRole: Role,
    payload: CreatePolarCheckoutInput
  ) {
    const plan = await Membership.findById(payload.membershipId);
    if (!plan || !plan.isActive) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        "The selected membership plan does not exist or is inactive."
      );
    }

    if (plan.role !== userRole) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `This membership plan is reserved for ${plan.role}.`
      );
    }

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

    const polarProductId = payload.productId || env.POLAR_PRODUCT_ID;
    if (!polarProductId) {
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Polar product ID is not configured."
      );
    }

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
          provider: "POLAR",
          originalUserEmail: user.email,
        },
      });

      // Save initial PENDING Payment record in database
      await PaymentRepository.createPayment({
        userId: new Types.ObjectId(userId),
        membershipId: plan._id as Types.ObjectId,
        amount: Math.round(plan.price * 100), // amount in cents/paise
        currency: plan.currency || "USD",
        status: "PENDING",
        provider: "RAZORPAY",
        providerPaymentId: checkoutSession.id,
        providerOrderId: checkoutSession.id,
        metadata: {
          polarCheckoutId: checkoutSession.id,
          polarProductId,
          checkoutUrl: checkoutSession.url,
        },
      });

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

    console.log(`📌 Processing Polar Webhook Event: ${eventType}`);

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
      $or: [
        { providerPaymentId: checkoutId },
        { providerOrderId: checkoutId },
        { "metadata.polarSubscriptionId": subscriptionIdStr },
      ],
      status: { $in: ["CAPTURED", "SUCCESS"] },
    });

    if (existingPayment) {
      console.log(`🔁 Polar Webhook: Event already processed for payment ${existingPayment._id}`);
      return;
    }

    await MembershipRepository.expireActiveSubscriptions(userObjId.toString());

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.durationInDays);

    const subscription = await MembershipRepository.createSubscription({
      userId: userObjId,
      membershipId: plan._id as Types.ObjectId,
      role: plan.role,
      planName: plan.name,
      amount: plan.price,
      currency: plan.currency || "USD",
      startDate,
      endDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      status: "ACTIVE",
      paymentStatus: "SUCCESS",
      autoRenew: true,
    });

    let payment = await Payment.findOne({
      $or: [
        { providerPaymentId: checkoutId },
        { providerOrderId: checkoutId },
        { userId: userObjId, status: "PENDING" },
      ],
    });

    if (!payment) {
      payment = new Payment({
        userId: userObjId,
        membershipId: plan._id,
        amount: Math.round(plan.price * 100),
        currency: plan.currency || "USD",
        status: "CAPTURED",
        provider: "RAZORPAY",
        providerPaymentId: checkoutId,
        providerOrderId: checkoutId,
        subscriptionId: subscription._id,
        paidAt: new Date(),
        metadata: {
          provider: "POLAR",
          polarCheckoutId: checkoutId,
          polarSubscriptionId: subscriptionIdStr,
          rawPolarData: data,
        },
      });
    } else {
      payment.status = "CAPTURED";
      payment.subscriptionId = subscription._id as Types.ObjectId;
      payment.paidAt = new Date();
      payment.metadata = {
        ...(payment.metadata || {}),
        provider: "POLAR",
        polarCheckoutId: checkoutId,
        polarSubscriptionId: subscriptionIdStr,
      };
    }

    await payment.save();
    console.log(`✅ Polar Webhook: Subscription activated successfully for user ${userObjId}`);
  }

  /**
   * Helper: Deactivate User Membership on revocation / cancellation
   */
  private static async processSubscriptionDeactivation(data: any, eventType: string) {
    const subscriptionIdStr = data.id || data.subscription_id;
    if (!subscriptionIdStr) return;

    const payment = await Payment.findOne({
      "metadata.polarSubscriptionId": subscriptionIdStr,
    });

    if (payment && payment.subscriptionId) {
      const statusMap: Record<string, "CANCELLED" | "EXPIRED" | "PAST_DUE"> = {
        "subscription.canceled": "CANCELLED",
        "subscription.revoked": "EXPIRED",
        "subscription.past_due": "PAST_DUE",
      };

      const newStatus = statusMap[eventType] || "CANCELLED";

      await Subscription.findByIdAndUpdate(payment.subscriptionId, {
        $set: {
          status: newStatus,
          autoRenew: false,
          cancelledAt: new Date(),
        },
      });

      console.log(`⚠️ Polar Webhook: Subscription ${payment.subscriptionId} status updated to ${newStatus}`);
    }
  }

  /**
   * Get Polar Checkout Session Status for frontend polling
   */
  static async getCheckoutStatus(checkoutId: string, userId: string) {
    const payment = await Payment.findOne({
      $or: [
        { providerPaymentId: checkoutId },
        { providerOrderId: checkoutId },
        { "metadata.polarCheckoutId": checkoutId },
      ],
    }).populate("subscriptionId");

    if (payment && (payment.status === "CAPTURED" || payment.status === "SUCCESS")) {
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
        isActivated: payment?.status === "CAPTURED" || payment?.status === "SUCCESS",
      };
    }
  }
}
