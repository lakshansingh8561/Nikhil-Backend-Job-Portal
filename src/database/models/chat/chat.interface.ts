import { Document, Types } from "mongoose";

export interface IUnreadCounts {
  jobSeeker: number;
  recruiter: number;
}

export interface IConversation extends Document {
  participants: Types.ObjectId[];
  recruiter: Types.ObjectId;
  jobSeeker: Types.ObjectId;
  jobId: Types.ObjectId;
  lastMessage?: Types.ObjectId;
  lastMessageAt?: Date;
  unreadCounts: IUnreadCounts;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAttachment {
  url: string;
  fileType: string;
  fileName: string;
}

export type MessageType = "text" | "image" | "file";

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  sender: Types.ObjectId;
  receiver: Types.ObjectId;
  message: string;
  messageType: MessageType;
  attachments?: IAttachment[];
  read: boolean;
  readAt?: Date;
  delivered: boolean;
  deliveredAt?: Date;
  replyTo?: Types.ObjectId;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
