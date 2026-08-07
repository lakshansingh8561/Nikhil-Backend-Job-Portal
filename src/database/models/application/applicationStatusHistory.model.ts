import { Schema, model } from "mongoose";
import { IApplicationStatusHistory } from "./applicationStatusHistory.interface";

const applicationStatusHistorySchema = new Schema<IApplicationStatusHistory>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    oldStatus: {
      type: String,
      default: "",
    },
    newStatus: {
      type: String,
      required: true,
    },
    changedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

applicationStatusHistorySchema.index({ applicationId: 1, createdAt: -1 });

export const ApplicationStatusHistory = model<IApplicationStatusHistory>(
  "ApplicationStatusHistory",
  applicationStatusHistorySchema
);
