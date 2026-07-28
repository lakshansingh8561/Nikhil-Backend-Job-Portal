import { Document, Types } from "mongoose";

export interface IRecruiterProfile extends Document {
  userId: Types.ObjectId;

  firstName: string;
  lastName: string;

  phone: string;

  designation: string;

  linkedin?: string;

  profilePicture?: string;

  companyId?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}