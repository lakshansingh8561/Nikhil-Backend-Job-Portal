import { Router } from "express";
import { PaymentController } from "./payment.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import {
  createOrderSchema,
  verifyPaymentSchema,
  createPolarCheckoutSchema,
  createRazorpaySubscriptionSchema,
  verifyRazorpaySubscriptionSchema,
} from "./payment.validation";

const router = Router();

// Public Webhook & Status Check routes (No JWT auth strictly required for checkout status verification)
router.post("/webhook", PaymentController.handleWebhook);
router.post("/polar/webhook", PaymentController.handlePolarWebhook);
router.get("/polar/status/:checkoutId", PaymentController.getPolarStatus);

// Protected routes requiring authentication
router.use(authenticate);

router.post(
  "/create-order",
  validate(createOrderSchema),
  PaymentController.createOrder
);

router.post(
  "/verify",
  validate(verifyPaymentSchema),
  PaymentController.verifyPayment
);

// Razorpay Subscriptions (Recurring Mandate)
router.post(
  "/razorpay-subscription/create",
  validate(createRazorpaySubscriptionSchema),
  PaymentController.createRazorpaySubscription
);

router.post(
  "/razorpay-subscription/verify",
  validate(verifyRazorpaySubscriptionSchema),
  PaymentController.verifyRazorpaySubscription
);

router.get("/preview-upgrade", PaymentController.previewUpgrade);
router.post("/preview-upgrade", PaymentController.previewUpgrade);

router.get("/my", PaymentController.getUserPayments);

// AutoPay cancellation / reactivation routes
router.post("/cancel-autopay", PaymentController.cancelAutopay);
router.post("/reactivate-autopay", PaymentController.reactivateAutopay);

// Polar Sandbox Protected Checkout Creation
router.post(
  "/polar/create-checkout",
  validate(createPolarCheckoutSchema),
  PaymentController.createPolarCheckout
);

export default router;
