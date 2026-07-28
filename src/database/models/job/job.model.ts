import { Schema, model } from "mongoose";
import { IJob } from "./job.interface";
import { EmploymentType } from "../../../common/enums/employmentType.enum";
import { ExperienceLevel } from "../../../common/enums/experienceLevel.enum";

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
    },

    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    recruiterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    location: {
      type: String,
      required: true,
    },

    salaryMin: {
      type: Number,
      required: true,
    },

    salaryMax: {
      type: Number,
      required: true,
    },

    employmentType: {
      type: String,
      enum: Object.values(EmploymentType),
      required: true,
    },

    experienceLevel: {
      type: String,
      enum: Object.values(ExperienceLevel),
      required: true,
    },

    skills: [
      {
        type: String,
        trim: true,
      },
    ],

    vacancies: {
      type: Number,
      default: 1,
      min: 1,
    },

    deadline: {
      type: Date,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

jobSchema.index({ title: "text", description: "text" });
jobSchema.index({ companyId: 1 });
jobSchema.index({ recruiterId: 1 });
jobSchema.index({ location: 1 });

export const Job = model<IJob>("Job", jobSchema);