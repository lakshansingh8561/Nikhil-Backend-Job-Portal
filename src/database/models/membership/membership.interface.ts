import { Document } from "mongoose";
import { Role } from "../../../common/enums/role.enum";
import { PaymentProvider } from "../../../common/enums/paymentProvider.enum";

export type BillingCycle = "monthly" | "yearly";

export interface IProviderPriceId {
  provider: PaymentProvider;
  providerPlanId: string; // e.g. Razorpay Plan ID or Polar Price ID
  providerProductId?: string; // e.g. Polar Product ID
}

export interface IMembershipPrice {
  billingCycle: BillingCycle;
  price: number;
  currency: string;
  durationInDays: number;
  providerPriceIds?: IProviderPriceId[];
}

export interface IMembershipFeature {
  title: string;
  description?: string;
  enabled: boolean;
}

export interface IMembership extends Document {
  name: string;
  role: Role;
  price: number;
  currency: string;
  planId?: string;
  durationInDays: number;
  prices?: IMembershipPrice[];
  description: string;
  features: IMembershipFeature[];
  isPopular: boolean;
  isRecommended: boolean;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
