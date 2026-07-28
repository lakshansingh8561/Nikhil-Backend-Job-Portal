import { Schema, model } from "mongoose";
import { IApplication } from "./application.interface";
import { ApplicationStatus } from "../../../common/enums/applicationStatus.enum";

const applicationSchema = new Schema<IApplication>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    applicantId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    resume: {
      type: String,
      required: true,
      trim: true,
    },

    coverLetter: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: Object.values(ApplicationStatus),
      default: ApplicationStatus.APPLIED,
    },
  },
  {
    timestamps: true,
  }
);

/*
|--------------------------------------------------------------------------
| Prevent Duplicate Applications
|--------------------------------------------------------------------------
*/

applicationSchema.index(
  {
    jobId: 1,
    applicantId: 1,
  },
  {
    unique: true,
  }
);

export const Application = model<IApplication>(
  "Application",
  applicationSchema
);