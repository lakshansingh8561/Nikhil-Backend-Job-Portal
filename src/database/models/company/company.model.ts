import { Schema, model } from "mongoose";
import { ICompany } from "./company.interface";

const companySchema = new Schema<ICompany>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    companyName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    tagline: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    industry: {
      type: String,
      required: true,
    },

    companySize: {
      type: String,
      required: true,
    },

    website: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
    },

    logo: {
      type: String,
      default: "",
    },

    coverImage: {
      type: String,
      default: "",
    },

    foundedYear: Number,

    headquarters: String,

    city: String,

    state: String,

    country: String,

    linkedin: String,

    twitter: String,

    facebook: String,

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// companySchema.index({ companyName: 1 });
// companySchema.index({ ownerId: 1 });

export const Company = model<ICompany>(
  "Company",
  companySchema
);