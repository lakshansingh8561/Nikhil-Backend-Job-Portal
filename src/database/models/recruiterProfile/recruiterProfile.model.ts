import { Schema, model } from "mongoose";
import { IRecruiterProfile } from "./recruiterProfile.interface";

const recruiterProfileSchema = new Schema<IRecruiterProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    designation: {
      type: String,
      required: true,
      trim: true,
      default: "Recruiter",
    },
    department: {
      type: String,
      default: "",
      trim: true,
    },
    currentCompany: {
      type: String,
      default: "",
      trim: true,
    },
    experience: {
      type: Number,
      default: 0,
      min: 0,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      default: null,
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

export const RecruiterProfile = model<IRecruiterProfile>(
  "RecruiterProfile",
  recruiterProfileSchema
);