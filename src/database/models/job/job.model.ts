import { Schema, model } from "mongoose";
import { IJob } from "./job.interface";

const jobSchema = new Schema<IJob>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    requirements: {
      type: String,
      default: "",
      trim: true,
    },
    responsibilities: {
      type: String,
      default: "",
      trim: true,
    },
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
    workplaceType: {
      type: String,
      enum: ["REMOTE", "HYBRID", "ONSITE"],
      default: "ONSITE",
    },
    jobType: {
      type: String,
      enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "FREELANCE"],
      default: "FULL_TIME",
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "PAUSED", "CLOSED", "ARCHIVED"],
      default: "ACTIVE",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    location: {
      type: Schema.Types.Mixed,
      default: "",
    },
    salaryMin: {
      type: Number,
      default: 0,
    },
    salaryMax: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    skills: {
      type: [String],
      default: [],
    },
    employmentType: {
      type: String,
      default: "FULL_TIME",
    },
    experienceLevel: {
      type: String,
      default: "Mid-Level",
    },
    deadline: {
      type: Date,
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

jobSchema.pre("save", function (next) {
  if (this.isActive !== undefined) {
    this.status = this.isActive ? "ACTIVE" : "CLOSED";
  }
  next();
});

jobSchema.index({ title: "text", description: "text" });
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ isActive: 1, createdAt: -1 });

export const Job = model<IJob>("Job", jobSchema);