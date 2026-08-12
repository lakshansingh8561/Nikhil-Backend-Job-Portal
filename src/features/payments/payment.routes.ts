import { Router } from "express";
import { PaymentController } from "./payment.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { createOrderSchema, verifyPaymentSchema, createPolarCheckoutSchema } from "./payment.validation";

const router = Router();

// Public Webhook routes (No JWT auth, signature verified by webhook handler)
router.post("/webhook", PaymentController.handleWebhook);
router.post("/polar/webhook", PaymentController.handlePolarWebhook);

// Protected routes
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

router.get("/preview-upgrade", PaymentController.previewUpgrade);
router.post("/preview-upgrade", PaymentController.previewUpgrade);

router.get("/my", PaymentController.getUserPayments);

// Polar Sandbox Protected routes
router.post(
  "/polar/create-checkout",
  validate(createPolarCheckoutSchema),
  PaymentController.createPolarCheckout
);

router.get("/polar/status/:checkoutId", PaymentController.getPolarStatus);

export default router;
