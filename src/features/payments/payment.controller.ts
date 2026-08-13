import { Request, Response } from "express";
import { PaymentService } from "./payment.service";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { PAYMENT_MESSAGES } from "./payment.constants";

const getUserIdFromReq = (req: Request): string => {
  const user = (req as any).user;
  if (!user) return "";
  return String(user.userId || user.id || user._id || "");
};

const getUserRoleFromReq = (req: Request): any => {
  const user = (req as any).user;
  return user?.role;
};

export class PaymentController {
  static createOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);
    const userRole = getUserRoleFromReq(req);

    const result = await PaymentService.createOrder(userId, userRole, req.body);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, result.message, result)
    );
  });

  static verifyPayment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);
    const userRole = getUserRoleFromReq(req);

    const result = await PaymentService.verifyPayment(userId, userRole, req.body);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, result.message, result)
    );
  });

  static handleWebhook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const signature = (req.headers["x-razorpay-signature"] as string) || "";
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const result = await PaymentService.handleWebhook(rawBody, signature);

    res.status(HTTP_STATUS.OK).json(result);
  });

  static previewUpgrade = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);
    const userRole = getUserRoleFromReq(req);
    const membershipId = (req.query.membershipId as string) || (req.body.membershipId as string);

    const result = await PaymentService.previewUpgrade(userId, userRole, membershipId);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, "Upgrade preview calculated successfully.", result)
    );
  });

  static getUserPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);

    const payments = await PaymentService.getUserPayments(userId);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, PAYMENT_MESSAGES.FETCHED_SUCCESS, payments)
    );
  });

  // ==========================================
  // POLAR SANDBOX ENDPOINTS
  // ==========================================
  static createPolarCheckout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);
    const userRole = getUserRoleFromReq(req);
    const origin = (req.headers.origin as string) || (req.headers.referer as string) || "";

    const { PolarService } = await import("./polar.service");
    const result = await PolarService.createCheckoutSession(userId, userRole, {
      ...req.body,
      origin,
    });

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, "Polar Sandbox Checkout Session created successfully.", result)
    );
  });

  static handlePolarWebhook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const { PolarService } = await import("./polar.service");
    const result = await PolarService.handleWebhook(rawBody, req.headers);

    res.status(HTTP_STATUS.OK).json(result);
  });

  static getPolarStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    let userId = "";
    try {
      userId = getUserIdFromReq(req);
    } catch {
      // Unauthenticated request fallback (e.g. redirected from gateway without auth header)
    }
    const checkoutId = (req.params.checkoutId as string) || "";

    const { PolarService } = await import("./polar.service");
    const result = await PolarService.getCheckoutStatus(checkoutId, userId);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, "Checkout status fetched successfully.", result)
    );
  });

  // ==========================================
  // RAZORPAY SUBSCRIPTION (RECURRING / AUTOPAY)
  // ==========================================
  static createRazorpaySubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);
    const userRole = getUserRoleFromReq(req);
    const { membershipId, planKey, billingCycle } = req.body;

    const { RazorpaySubscriptionService } = await import("./razorpay-subscription.service");
    const result = await RazorpaySubscriptionService.createSubscription(
      userId,
      userRole,
      membershipId,
      planKey,
      billingCycle
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, "Razorpay subscription created successfully.", result)
    );
  });

  static verifyRazorpaySubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);
    const userRole = getUserRoleFromReq(req);

    const { RazorpaySubscriptionService } = await import("./razorpay-subscription.service");
    const result = await RazorpaySubscriptionService.verifySubscriptionPayment(
      userId,
      userRole,
      req.body
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, result.message, result)
    );
  });

  // ==========================================
  // CANCEL / REACTIVATE AUTOPAY (both providers)
  // ==========================================
  static cancelAutopay = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);
    const cancelAtPeriodEnd: boolean = req.body.cancelAtPeriodEnd !== false; // default true

    // Detect provider from active subscription
    const { Subscription } = await import("../../database/models");
    const { Types } = await import("mongoose");
    const sub = await Subscription.findOne({
      userId: new Types.ObjectId(userId),
      status: "ACTIVE",
    });

    if (!sub) {
      throw new Error("No active subscription found.");
    }

    let result: any;
    if (sub.providerSubscriptionId?.startsWith("sub_")) {
      // Razorpay subscription IDs start with sub_
      const { RazorpaySubscriptionService } = await import("./razorpay-subscription.service");
      result = await RazorpaySubscriptionService.cancelSubscription(userId, cancelAtPeriodEnd);
    } else {
      // Default to Polar
      const { PolarService } = await import("./polar.service");
      result = await PolarService.cancelAutoPay(userId);
    }

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, result.message, result)
    );
  });

  static reactivateAutopay = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);

    const { PolarService } = await import("./polar.service");
    const result = await PolarService.reactivateAutoPay(userId);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, result.message, result)
    );
  });
}
