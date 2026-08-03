import { Document, Types } from "mongoose";

export interface INotification extends Document {
  recipientId: Types.ObjectId;
  senderId?: Types.ObjectId;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}
