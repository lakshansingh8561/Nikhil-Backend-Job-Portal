import { Document, Types } from "mongoose";

export interface IApplicationStatusHistory extends Document {
  applicationId: Types.ObjectId;
  oldStatus?: string;
  newStatus: string;
  changedByUserId?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
}