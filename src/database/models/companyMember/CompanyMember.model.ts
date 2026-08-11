import { Schema, model } from "mongoose";
import { ICompanyMember } from "./companyMember.interface";

const companyMemberSchema = new Schema<ICompanyMember>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["OWNER", "RECRUITER", "HR", "HIRING_MANAGER"],
      default: "RECRUITER",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
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

companyMemberSchema.index({ companyId: 1, userId: 1 }, { unique: true });

export const CompanyMember = model<ICompanyMember>("CompanyMember", companyMemberSchema);
