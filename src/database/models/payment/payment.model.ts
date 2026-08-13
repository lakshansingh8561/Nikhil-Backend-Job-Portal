import { Schema, model } from "mongoose";
import { IPayment } from "./payment.interface";
import { PaymentProvider, PaymentStatus } from "../../../common/enums";

const paymentSchema = new Schema<IPayment>(
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
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
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
    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      index: true,
    },
    providerPaymentId: {
      type: String,
      default: null,
      trim: true,
    },
    providerOrderId: {
      type: String,
      default: null,
      trim: true,
    },
    providerSubscriptionId: {
      type: String,
      default: null,
      trim: true,
    },
    paymentMethod: {
      type: String,
      default: null,
      trim: true,
    },
    failureReason: {
      type: String,
      default: null,
      trim: true,
    },
    providerData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    paidAt: {
      type: Date,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
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

paymentSchema.index({
  userId: 1,
  status: 1,
});

paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerPaymentId: { $type: "string" } },
  }
);

paymentSchema.index(
  { provider: 1, providerOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerOrderId: { $type: "string" } },
  }
);

export const Payment = model<IPayment>("Payment", paymentSchema);
