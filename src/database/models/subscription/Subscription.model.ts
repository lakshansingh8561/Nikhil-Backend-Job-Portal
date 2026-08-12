import { Schema, model } from "mongoose";
import { ISubscription } from "./subscription.interface";

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
      enum: ["PENDING", "ACTIVE", "EXPIRED", "CANCELLED", "PAST_DUE"],
      default: "PENDING",
      index: true,
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
    // Recurring / AutoPay fields
    providerSubscriptionId: {
      type: String,
      default: null,
      trim: true,
      index: true,
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

subscriptionSchema.index({
  userId: 1,
  status: 1,
});

subscriptionSchema.index({
  endDate: 1,
  status: 1,
});

export const Subscription = model<ISubscription>(
  "Subscription",
  subscriptionSchema
);
