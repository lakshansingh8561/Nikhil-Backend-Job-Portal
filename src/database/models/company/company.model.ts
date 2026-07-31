import { Schema, model } from "mongoose";
import { ICompany } from "./company.interface";

const companySchema = new Schema<ICompany>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    companyName: {
      type: String,
      required: true,
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

    mission: {
      type: String,
      default: "",
    },

    vision: {
      type: String,
      default: "",
    },

    industry: {
      type: String,
      required: true,
      trim: true,
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
      default: "",
    },

    phone: {
      type: String,
      default: "",
    },

    logo: {
      type: String,
      default: "",
    },

    coverImage: {
      type: String,
      default: "",
    },

    foundedYear: {
      type: Number,
    },

    headquarters: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    city: {
      type: String,
      default: "",
    },

    state: {
      type: String,
      default: "",
    },

    country: {
      type: String,
      default: "",
    },

    linkedin: {
      type: String,
      default: "",
    },

    facebook: {
      type: String,
      default: "",
    },

    twitter: {
      type: String,
      default: "",
    },

    instagram: {
      type: String,
      default: "",
    },

    github: {
      type: String,
      default: "",
    },

    youtube: {
      type: String,
      default: "",
    },

    officeImages: {
      type: [String],
      default: [],
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Company = model<ICompany>("Company", companySchema);