import { z } from "zod";

export const createOrderSchema = z.object({
  membershipId: z.string().min(1, "Membership ID is required"),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, "Razorpay Order ID is required"),
  razorpay_payment_id: z.string().min(1, "Razorpay Payment ID is required"),
  razorpay_signature: z.string().min(1, "Razorpay Signature is required"),
});

export const createPolarCheckoutSchema = z.object({
  membershipId: z.string().min(1, "Membership ID is required"),
  productId: z.string().optional(),
});
