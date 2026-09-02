import { Document, Types } from "mongoose";

export interface IBlogComment extends Document {
  blog: Types.ObjectId;
  user?: Types.ObjectId;
  name: string;
  email: string;
  avatar: string;
  content: string;
  isApproved: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
