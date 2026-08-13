import { Schema, model } from "mongoose";
import { ISubscription } from "./subscription.interface";
import { PaymentProvider } from "../../../common/enums/paymentProvider.enum";
import { SubscriptionStatus } from "../../../common/enums/subscriptionStatus.enum";

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    membershipId: {
      type: Schema.Types.ObjectId,
      ref: "Membership",
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    planName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
      index: true,
    },
    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      required: true,
      default: PaymentProvider.RAZORPAY,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    currentPeriodStart: {
      type: Date,
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.PENDING,
      index: true,
    },
    // Recurring / AutoPay fields
    providerSubscriptionId: {
      type: String,
      default: null,
      trim: true,
    },
    providerCustomerId: {
      type: String,
      default: null,
      trim: true,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
      index: true,
    },
    nextBillingDate: {
      type: Date,
      default: null,
    },
    lastPaymentStatus: {
      type: String,
      default: null,
      trim: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledReason: {
      type: String,
      default: null,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate active subscriptions per user at database level
subscriptionSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE", isDeleted: false },
  }
);

// Prevent duplicate provider subscription mappings
subscriptionSchema.index(
  { provider: 1, providerSubscriptionId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerSubscriptionId: { $type: "string" } },
  }
);

subscriptionSchema.index({
  endDate: 1,
  status: 1,
});

export const Subscription = model<ISubscription>(
  "Subscription",
  subscriptionSchema
);
