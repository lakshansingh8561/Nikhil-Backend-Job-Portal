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
import { Role } from "../../common/enums/role.enum";

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
   * Create Razorpay Order for Membership Subscription
   */
  static async createOrder(userId: string, userRole: Role, payload: CreateOrderInput) {
    const plan = await Membership.findById(payload.membershipId);

    if (!plan || !plan.isActive) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        PAYMENT_MESSAGES.MEMBERSHIP_NOT_FOUND
      );
    }

    if (plan.role !== userRole) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        PAYMENT_MESSAGES.INVALID_ROLE
      );
    }

    // If Free Plan, directly activate without Razorpay order
    if (plan.price === 0) {
      await MembershipRepository.expireActiveSubscriptions(userId);
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + plan.durationInDays);

      const freeSubscription = await MembershipRepository.createSubscription({
        userId: new Types.ObjectId(userId),
        membershipId: plan._id as Types.ObjectId,
        role: userRole,
        planName: plan.name,
        amount: 0,
        currency: plan.currency || "INR",
        startDate,
        endDate,
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
        status: "ACTIVE",
        paymentStatus: "SUCCESS",
        autoRenew: false,
      });

      await PaymentRepository.createPayment({
        userId: new Types.ObjectId(userId),
        membershipId: plan._id as Types.ObjectId,
        subscriptionId: freeSubscription._id,
        amount: 0,
        currency: plan.currency || "INR",
        status: "CAPTURED",
        provider: "MANUAL",
        paidAt: new Date(),
      });

      return {
        isFree: true,
        message: "Free subscription activated successfully.",
        subscription: freeSubscription,
      };
    }

    // Paid plan: Create Razorpay Order
    const razorpay = this.getRazorpayInstance();
    const amountInPaise = Math.round(plan.price * 100);
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
      },
    };

    const razorpayOrder = await razorpay.orders.create(orderOptions);

    // Save PENDING Payment record in database
    await PaymentRepository.createPayment({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      amount: amountInPaise,
      currency,
      status: "PENDING",
      provider: "RAZORPAY",
      razorpayOrderId: razorpayOrder.id,
      providerOrderId: razorpayOrder.id,
    });

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_TEST_KEY;

    return {
      isFree: false,
      message: PAYMENT_MESSAGES.ORDER_CREATED,
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
      },
    };
  }

  /**
   * Verify Razorpay Payment Signature & Activate Subscription
   */
  static async verifyPayment(userId: string, userRole: Role, payload: VerifyPaymentInput) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;

    const payment = await PaymentRepository.findByRazorpayOrderId(razorpay_order_id);

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

    if (payment.status === "CAPTURED" || payment.status === "SUCCESS") {
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
      payment.status = "FAILED";
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

    await MembershipRepository.expireActiveSubscriptions(userId);

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.durationInDays);

    const subscription = await MembershipRepository.createSubscription({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      role: userRole,
      planName: plan.name,
      amount: plan.price,
      currency: plan.currency || "INR",
      startDate,
      endDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      status: "ACTIVE",
      paymentStatus: "SUCCESS",
      autoRenew: true,
    });

    payment.status = "CAPTURED";
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.providerPaymentId = razorpay_payment_id;
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
   * Idempotent Webhook Handler for Razorpay Async Events
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
    const eventType = event.event;
    const payloadEntity = event.payload?.payment?.entity || event.payload?.order?.entity;

    if (!payloadEntity) {
      return { success: true, message: "Ignored event without payload" };
    }

    const orderId = payloadEntity.order_id || payloadEntity.id;
    const paymentId = payloadEntity.id;

    const payment = await Payment.findOne({ razorpayOrderId: orderId });

    if (!payment) {
      return { success: true, message: "No matching payment record found" };
    }

    if (eventType === "payment.captured" || eventType === "payment.authorized") {
      if (payment.status !== "CAPTURED" && payment.status !== "SUCCESS") {
        payment.status = "CAPTURED";
        payment.razorpayPaymentId = paymentId;
        payment.paidAt = new Date();
        await payment.save();

        if (payment.membershipId && payment.userId) {
          const plan = await Membership.findById(payment.membershipId);
          if (plan) {
            await MembershipRepository.expireActiveSubscriptions(payment.userId.toString());
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(startDate.getDate() + plan.durationInDays);

            const subscription = await MembershipRepository.createSubscription({
              userId: payment.userId,
              membershipId: plan._id as Types.ObjectId,
              role: plan.role,
              planName: plan.name,
              amount: plan.price,
              currency: plan.currency || "INR",
              startDate,
              endDate,
              currentPeriodStart: startDate,
              currentPeriodEnd: endDate,
              status: "ACTIVE",
              paymentStatus: "SUCCESS",
              autoRenew: true,
            });

            payment.subscriptionId = subscription._id;
            await payment.save();
          }
        }
      }
    } else if (eventType === "payment.failed") {
      payment.status = "FAILED";
      payment.failureReason = payloadEntity.error_description || "Payment failed at gateway";
      await payment.save();
    } else if (eventType === "payment.refunded") {
      payment.status = "REFUNDED";
      await payment.save();
    }

    return { success: true, message: PAYMENT_MESSAGES.WEBHOOK_PROCESSED };
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
