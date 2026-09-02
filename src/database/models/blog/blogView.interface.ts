import { Document, Types } from "mongoose";

export interface IBlogView extends Document {
  blog: Types.ObjectId;
  user: Types.ObjectId | null;
  ipHash: string | null;
  createdAt: Date;
}
