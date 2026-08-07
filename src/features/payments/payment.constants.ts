export const PAYMENT_MESSAGES = {
  ORDER_CREATED: "Payment order created successfully.",
  PAYMENT_VERIFIED: "Payment verified and subscription activated successfully.",
  PAYMENT_FAILED: "Payment verification failed. Invalid signature or missing payment details.",
  MEMBERSHIP_NOT_FOUND: "Selected membership plan not found or inactive.",
  INVALID_ROLE: "Membership plan role does not match user account role.",
  ALREADY_SUBSCRIBED: "You already have an active subscription for this plan.",
  PAYMENT_NOT_FOUND: "Payment record not found.",
  WEBHOOK_PROCESSED: "Webhook event processed successfully.",
  INVALID_WEBHOOK_SIGNATURE: "Invalid webhook signature.",
  FETCHED_SUCCESS: "Payment history fetched successfully.",
} as const;
