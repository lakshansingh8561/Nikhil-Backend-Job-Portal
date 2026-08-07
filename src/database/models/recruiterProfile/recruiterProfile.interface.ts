import { Document, Types } from "mongoose";

export interface IRecruiterProfile extends Document {
  userId: Types.ObjectId;
  designation: string;
  department?: string;
  currentCompany?: string;
  experience?: number;
  companyId?: Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}