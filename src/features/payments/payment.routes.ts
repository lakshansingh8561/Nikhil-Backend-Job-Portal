import { Router } from "express";
import { PaymentController } from "./payment.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { createOrderSchema, verifyPaymentSchema } from "./payment.validation";

const router = Router();

// Public Webhook route (No JWT auth, signature verified via HMAC SHA-256)
router.post("/webhook", PaymentController.handleWebhook);

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

router.get("/my", PaymentController.getUserPayments);

export default router;
