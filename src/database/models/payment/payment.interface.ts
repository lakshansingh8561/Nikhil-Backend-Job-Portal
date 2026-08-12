import { Document, Types } from "mongoose";
import { PaymentProvider, PaymentStatus } from "../../../common/enums";

export interface IPayment extends Document {
  userId: Types.ObjectId;
  membershipId: Types.ObjectId;
  subscriptionId?: Types.ObjectId | null;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  providerPaymentId?: string | null;
  providerOrderId?: string | null;
  providerSubscriptionId?: string | null;
  paymentMethod?: string | null;
  failureReason?: string | null;
  providerData?: Record<string, any>;
  metadata?: Record<string, any>;
  paidAt?: Date | null;
  refundedAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
