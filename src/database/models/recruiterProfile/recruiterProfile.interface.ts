import { Document, Types } from "mongoose";

export interface IRecruiterProfile extends Document {
  userId: Types.ObjectId;

  firstName: string;
  lastName: string;

  phone: string;

  designation: string;

  currentCompany?: string;

  experience?: number;

  currentLocation?: string;

  headline?: string;

  bio?: string;

  linkedin?: string;

  github?: string;

  portfolio?: string;

  profilePicture?: string;

  companyId?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}