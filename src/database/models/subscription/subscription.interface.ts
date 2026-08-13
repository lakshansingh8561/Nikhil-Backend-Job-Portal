import { Document, Types } from "mongoose";
import { PaymentProvider } from "../../../common/enums/paymentProvider.enum";
import { SubscriptionStatus } from "../../../common/enums/subscriptionStatus.enum";
import { BillingCycle } from "../membership/membership.interface";

export { SubscriptionStatus, BillingCycle };

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  membershipId: Types.ObjectId;
  role: string;
  planName: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  provider: PaymentProvider;
  startDate: Date;
  endDate: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  status: SubscriptionStatus;
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
