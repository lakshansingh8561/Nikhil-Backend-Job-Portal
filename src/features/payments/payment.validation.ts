import { z } from "zod";

export const createOrderSchema = z.object({
  membershipId: z.string().min(1, "Membership ID is required"),
  billingCycle: z.enum(["monthly", "yearly"] as const).optional().default("monthly"),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, "Razorpay Order ID is required"),
  razorpay_payment_id: z.string().min(1, "Razorpay Payment ID is required"),
  razorpay_signature: z.string().min(1, "Razorpay Signature is required"),
});

export const createPolarCheckoutSchema = z.object({
  membershipId: z.string().min(1, "Membership ID is required"),
  productId: z.string().optional(),
  billingCycle: z.enum(["monthly", "yearly"] as const).optional().default("monthly"),
});

export const createRazorpaySubscriptionSchema = z.object({
  membershipId: z.string().min(1, "Membership ID is required"),
  planKey: z.enum(["pro", "premium", "professional", "enterprise"] as const),
  billingCycle: z.enum(["monthly", "yearly"] as const),
});

export const verifyRazorpaySubscriptionSchema = z.object({
  razorpay_payment_id: z.string().min(1, "Razorpay Payment ID is required"),
  razorpay_subscription_id: z.string().min(1, "Razorpay Subscription ID is required"),
  razorpay_signature: z.string().min(1, "Razorpay Signature is required"),
});

export const cancelAutopaySchema = z.object({
  cancelAtPeriodEnd: z.boolean().optional().default(true),
});
