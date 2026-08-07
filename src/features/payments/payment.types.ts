export interface CreateOrderInput {
  membershipId: string;
}

export interface VerifyPaymentInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
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
