import { Document, Types } from "mongoose";

export type PaymentTransactionStatus = "PENDING" | "AUTHORIZED" | "CAPTURED" | "SUCCESS" | "FAILED" | "REFUNDED";
export type PaymentProvider = "RAZORPAY" | "STRIPE" | "PAYPAL" | "MANUAL";

export interface IPayment extends Document {
  userId: Types.ObjectId;
  membershipId?: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  amount: number; // Stored in smallest currency unit (paise) or base currency
  currency: string;
  status: PaymentTransactionStatus;
  provider: PaymentProvider;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  method?: string;
  failureReason?: string;
  metadata?: Record<string, any>;
  paidAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
