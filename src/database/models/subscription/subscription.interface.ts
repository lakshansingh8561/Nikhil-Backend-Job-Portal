import { Document, Types } from "mongoose";

export type SubscriptionStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED" | "PAST_DUE";
export type BillingCycle = "monthly" | "yearly";

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  membershipId: Types.ObjectId;
  role: string;
  planName: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  startDate: Date;
  endDate: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  status: SubscriptionStatus;
  autoRenew: boolean;
  // Recurring / AutoPay fields
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  cancelAtPeriodEnd: boolean;
  nextBillingDate?: Date | null;
  lastPaymentStatus?: string | null;
  // Cancellation
  cancelledAt?: Date | null;
  cancelledReason?: string | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

