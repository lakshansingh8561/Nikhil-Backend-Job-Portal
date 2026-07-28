import { Schema, model } from "mongoose";
import { IUser } from "./user.interface";
import { Role } from "../../../common/enums/role.enum";
import { UserStatus } from "../../../common/enums/userStatus.enum";

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: Object.values(Role),
      default: Role.JOB_SEEKER,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    lastLogin: {
      type: Date,
    },
      refreshToken: {
      type: String,
      default: null,
      select: false,
    }
  },
  {
    timestamps: true,
  }
);

// performance indexes 
// userSchema.index({ email: 1 });

export const User = model<IUser>("User", userSchema);