import crypto from "crypto";
import Razorpay from "razorpay";
import { Types } from "mongoose";
import { Membership, Payment, Subscription } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { PAYMENT_MESSAGES } from "./payment.constants";
import { CreateOrderInput, VerifyPaymentInput, PaymentQueryFilters } from "./payment.types";
import { PaymentRepository } from "./payment.repository";
import { MembershipRepository } from "../memberships/membership.repository";
import { MembershipService } from "../memberships/membership.service";
import { Role } from "../../common/enums/role.enum";
import { PaymentProvider, PaymentStatus } from "../../common/enums";

export class PaymentService {
  private static getRazorpayInstance(): Razorpay {
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_TEST_KEY;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY;

    if (!keyId || !keySecret) {
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Razorpay credentials are not configured on the server."
      );
    }

    return new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  /**
   * Create Razorpay Order for Membership Purchase or Prorated Upgrade
   */
  static async createOrder(userId: string, userRole: Role, payload: CreateOrderInput) {
    // Perform plan hierarchy verification & prorated upgrade calculation
    const upgradeCalc = await MembershipService.calculateProratedUpgrade(
      userId,
      userRole,
      payload.membershipId
    );

    const plan = upgradeCalc.newPlan;
    const payableAmount = upgradeCalc.finalUpgradePrice;

    // If Free Plan, directly activate without Razorpay order
    if (plan.price === 0) {
      return MembershipService.subscribe(userId, userRole, payload.membershipId);
    }

    // Paid plan: Create Razorpay Order with prorated amount
    const razorpay = this.getRazorpayInstance();
    const amountInPaise = Math.round(payableAmount * 100);
    const currency = plan.currency || "INR";
    const safeUserId = String(userId || "");
    const receipt = `rcpt_${safeUserId.slice(-6)}_${Date.now()}`;

    const orderOptions = {
      amount: amountInPaise,
      currency,
      receipt,
      notes: {
        userId,
        membershipId: plan._id.toString(),
        userRole,
        planName: plan.name,
        isUpgrade: upgradeCalc.isUpgrade ? "true" : "false",
        oldSubId: upgradeCalc.currentSub ? upgradeCalc.currentSub._id.toString() : "",
        unusedCredit: upgradeCalc.unusedCredit.toString(),
        fullPrice: plan.price.toString(),
        finalUpgradePrice: payableAmount.toString(),
      },
    };

    const razorpayOrder = await razorpay.orders.create(orderOptions);

    // Save PENDING Payment record in database with provider-independent architecture
    await PaymentRepository.createPayment({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      amount: amountInPaise,
      currency,
      status: PaymentStatus.PENDING,
      provider: PaymentProvider.RAZORPAY,
      providerOrderId: razorpayOrder.id,
      providerData: {
        receipt,
        notes: orderOptions.notes,
      },
      metadata: {
        isUpgrade: upgradeCalc.isUpgrade,
        oldSubId: upgradeCalc.currentSub ? upgradeCalc.currentSub._id.toString() : null,
        unusedCredit: upgradeCalc.unusedCredit,
        fullPrice: plan.price,
        finalUpgradePrice: payableAmount,
      },
    });

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_TEST_KEY;

    return {
      isFree: false,
      message: upgradeCalc.isUpgrade
        ? `Upgrade order created for ₹${payableAmount} (includes ₹${upgradeCalc.unusedCredit} prorated credit).`
        : PAYMENT_MESSAGES.ORDER_CREATED,
      data: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId,
        membership: {
          id: plan._id,
          name: plan.name,
          price: plan.price,
          currency: plan.currency,
          durationInDays: plan.durationInDays,
        },
        upgradeInfo: {
          isUpgrade: upgradeCalc.isUpgrade,
          unusedCredit: upgradeCalc.unusedCredit,
          finalUpgradePrice: payableAmount,
          originalPrice: plan.price,
        },
      },
    };
  }

  /**
   * Verify Payment Signature & Activate Subscription (Replacing old subscription on upgrade)
   */
  static async verifyPayment(userId: string, userRole: Role, payload: VerifyPaymentInput) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;

    const payment = await PaymentRepository.findByProviderOrderId(PaymentProvider.RAZORPAY, razorpay_order_id);

    if (!payment) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        PAYMENT_MESSAGES.PAYMENT_NOT_FOUND
      );
    }

    if (payment.userId.toString() !== userId) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        "Payment order does not belong to the authenticated user."
      );
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      const existingSub = await Subscription.findOne({
        userId: new Types.ObjectId(userId),
        membershipId: payment.membershipId,
        status: "ACTIVE",
      });
      return {
        message: "Payment already verified and active.",
        subscription: existingSub,
        payment,
      };
    }

    // Perform HMAC SHA-256 Signature Verification
    const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || "";
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const isSignatureValid = generatedSignature === razorpay_signature;

    if (!isSignatureValid) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = "Signature verification failed.";
      await payment.save();

      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        PAYMENT_MESSAGES.PAYMENT_FAILED
      );
    }

    // Signature is valid: Activate Subscription
    const plan = await Membership.findById(payment.membershipId);
    if (!plan) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, PAYMENT_MESSAGES.MEMBERSHIP_NOT_FOUND);
    }

    // If upgrade, mark old active subscription as REPLACED
    const oldSubId = payment.metadata?.oldSubId;
    if (oldSubId) {
      await Subscription.findByIdAndUpdate(oldSubId, {
        $set: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledReason: `Upgraded to ${plan.name}`,
          autoRenew: false,
        },
      });
    }

    // Expire any other active subscriptions
    await MembershipRepository.expireActiveSubscriptions(userId);

    // Create NEW 30-day subscription from current time
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationInDays * 24 * 60 * 60 * 1000);

    const subscription = await MembershipRepository.createSubscription({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      role: userRole,
      planName: plan.name,
      amount: payment.amount ? Math.round(payment.amount / 100) : plan.price,
      currency: plan.currency || "INR",
      startDate,
      endDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      status: "ACTIVE",
      autoRenew: true,
    });

    payment.status = PaymentStatus.SUCCESS;
    payment.providerPaymentId = razorpay_payment_id;
    payment.providerData = {
      ...(payment.providerData || {}),
      signature: razorpay_signature,
    };
    payment.subscriptionId = subscription._id;
    payment.paidAt = new Date();
    await payment.save();

    return {
      message: PAYMENT_MESSAGES.PAYMENT_VERIFIED,
      subscription,
      payment,
    };
  }

  /**
   * Idempotent Webhook Handler for Gateway Async Events
   * Routes subscription events to RazorpaySubscriptionService.
   */
  static async handleWebhook(rawBody: string | Buffer, signatureHeader: string) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "whsec_test_jobbox_2026";

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signatureHeader) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, PAYMENT_MESSAGES.INVALID_WEBHOOK_SIGNATURE);
    }

    const event = JSON.parse(rawBody.toString());
    const eventType: string = event.event || "";

    console.log(`[Razorpay] Webhook received: event=${eventType}`);

    // ── Route subscription lifecycle events ─────────────────────────────────
    if (eventType.startsWith("subscription.") ||
        (eventType === "payment.failed" && event.payload?.subscription)) {
      const { RazorpaySubscriptionService } = await import("./razorpay-subscription.service");
      const result = await RazorpaySubscriptionService.processSubscriptionWebhookEvent(event);
      return { success: true, message: PAYMENT_MESSAGES.WEBHOOK_PROCESSED, ...result };
    }

    // ── One-time payment events (existing logic) ─────────────────────────────
    const payloadEntity = event.payload?.payment?.entity || event.payload?.order?.entity;

    if (!payloadEntity) {
      return { success: true, message: "Ignored event without payload" };
    }

    const orderId = payloadEntity.order_id || payloadEntity.id;
    const paymentId = payloadEntity.id;

    const payment = await Payment.findOne({ providerOrderId: orderId });

    if (!payment) {
      return { success: true, message: "No matching payment record found" };
    }

    if (eventType === "payment.captured" || eventType === "payment.authorized") {
      if (payment.status !== PaymentStatus.SUCCESS) {
        payment.status = PaymentStatus.SUCCESS;
        payment.providerPaymentId = paymentId;
        payment.paidAt = new Date();
        await payment.save();

        if (payment.membershipId && payment.userId) {
          const plan = await Membership.findById(payment.membershipId);
          if (plan) {
            // Expire old subscriptions
            await MembershipRepository.expireActiveSubscriptions(payment.userId.toString());

            const startDate = new Date();
            const endDate = new Date(startDate.getTime() + plan.durationInDays * 24 * 60 * 60 * 1000);

            const subscription = await MembershipRepository.createSubscription({
              userId: payment.userId,
              membershipId: plan._id as Types.ObjectId,
              role: plan.role,
              planName: plan.name,
              amount: payment.amount ? Math.round(payment.amount / 100) : plan.price,
              currency: payment.currency || "INR",
              startDate,
              endDate,
              currentPeriodStart: startDate,
              currentPeriodEnd: endDate,
              status: "ACTIVE",
              autoRenew: true,
              cancelAtPeriodEnd: false,
            } as any);

            payment.subscriptionId = subscription._id;
            await payment.save();
          }
        }
      }
    } else if (eventType === "payment.failed") {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = payloadEntity.error_description || "Payment failed at gateway";
      await payment.save();
    } else if (eventType === "payment.refunded") {
      payment.status = PaymentStatus.REFUNDED;
      payment.refundedAt = new Date();
      await payment.save();
    }

    return { success: true, message: PAYMENT_MESSAGES.WEBHOOK_PROCESSED };
  }

  /**
   * Preview Upgrade calculation endpoint for UI confirmation modal
   */
  static async previewUpgrade(userId: string, userRole: Role, membershipId: string) {
    return MembershipService.calculateProratedUpgrade(userId, userRole, membershipId);
  }

  /**
   * Get authenticated user payment history
   */
  static async getUserPayments(userId: string) {
    const payments = await PaymentRepository.findUserPayments(userId);
    return payments;
  }

  /**
   * Get admin payment transactions & statistics
   */
  static async getAdminPayments(filters: PaymentQueryFilters) {
    return PaymentRepository.findPaymentsWithFilters(filters);
  }
}
