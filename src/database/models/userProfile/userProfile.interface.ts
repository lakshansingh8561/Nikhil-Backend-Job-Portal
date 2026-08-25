import { Document, Types } from "mongoose";

export interface IUserProfile extends Document {
  userId: Types.ObjectId;
  firstName: string;
  lastName: string;
  phone?: string;
  headline?: string;
  bio?: string;
  profilePicture?: string;
  /** Wide banner image shown behind the avatar on the profile hero. */
  coverPhoto?: string;
  skills: string[];
  gender?: string;
  dateOfBirth?: Date;
  location?: {
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
  };
  socialLinks?: {
    linkedin?: string;
    github?: string;
    twitter?: string;
    website?: string;
    portfolio?: string;
  };
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
