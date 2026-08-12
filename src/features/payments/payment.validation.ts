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
  billingCycle: z.enum(["monthly", "yearly"]).optional().default("monthly"),
});

export const createRazorpaySubscriptionSchema = z.object({
  membershipId: z.string().min(1, "Membership ID is required"),
  planKey: z.enum(["pro", "premium"], { required_error: "planKey must be 'pro' or 'premium'" }),
  billingCycle: z.enum(["monthly", "yearly"], { required_error: "billingCycle is required" }),
});

export const verifyRazorpaySubscriptionSchema = z.object({
  razorpay_payment_id: z.string().min(1, "Razorpay Payment ID is required"),
  razorpay_subscription_id: z.string().min(1, "Razorpay Subscription ID is required"),
  razorpay_signature: z.string().min(1, "Razorpay Signature is required"),
});

export const cancelAutopaySchema = z.object({
  cancelAtPeriodEnd: z.boolean().optional().default(true),
});

