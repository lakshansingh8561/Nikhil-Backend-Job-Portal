import { Schema, model } from "mongoose";
import { IOtp } from "./otp.interface";

const otpSchema = new Schema<IOtp>(
  {
    email: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index: automatically delete document when expiresAt time is reached
    },
  },
  {
    timestamps: true,
  }
);

export const Otp = model<IOtp>("Otp", otpSchema);
