export interface CreateOrderInput {
  membershipId: string;
}

export interface VerifyPaymentInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface CreatePolarCheckoutInput {
  membershipId: string;
  productId?: string;
  billingCycle?: "monthly" | "yearly";
}

export interface CreateRazorpaySubscriptionInput {
  membershipId: string;
  planKey: "pro" | "premium";
  billingCycle: "monthly" | "yearly";
}

export interface VerifyRazorpaySubscriptionInput {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

export interface CancelAutopayInput {
  cancelAtPeriodEnd?: boolean;
}

export interface PaymentQueryFilters {
  page?: number;
  limit?: number;
  status?: string;
  provider?: string;
  role?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}
