import { Schema, model } from "mongoose";
import { IMembership } from "./membership.interface";
import { Role } from "../../../common/enums/role.enum";
import { PaymentProvider } from "../../../common/enums/paymentProvider.enum";

const providerPriceIdSchema = new Schema(
  {
    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      required: true,
    },
    providerPlanId: {
      type: String,
      required: true,
      trim: true,
    },
    providerProductId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: false }
);

const membershipPriceSchema = new Schema(
  {
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      required: true,
      default: "monthly",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    durationInDays: {
      type: Number,
      default: 30,
      min: 1,
    },
    providerPriceIds: {
      type: [providerPriceIdSchema],
      default: [],
    },
  },
  { _id: false }
);

const membershipFeatureSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const membershipSchema = new Schema<IMembership>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: Object.values(Role),
      default: Role.JOB_SEEKER,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    planId: {
      type: String,
      default: "",
      trim: true,
    },
    durationInDays: {
      type: Number,
      default: 30,
      min: 1,
    },
    prices: {
      type: [membershipPriceSchema],
      default: [],
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    features: {
      type: [membershipFeatureSchema],
      default: [],
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isRecommended: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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

membershipSchema.index({ name: 1, role: 1 });
membershipSchema.index({ price: 1 });

export const Membership = model<IMembership>("Membership", membershipSchema);
