import { Document, Types } from "mongoose";

export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "CANCELLED" | "PENDING" | "PAST_DUE";
export type SubscriptionPaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "PAID" | "REFUNDED";

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  membershipId: Types.ObjectId;
  role?: string;
  planName: string;
  amount: number;
  currency: string;
  startDate: Date;
  endDate: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  razorpaySubscriptionId?: string;
  status: SubscriptionStatus;
  paymentStatus: SubscriptionPaymentStatus;
  autoRenew: boolean;
  cancelledAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
