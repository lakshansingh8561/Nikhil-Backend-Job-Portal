import { Document, Types } from "mongoose";

export type ConversationType = "DIRECT" | "GROUP" | "SYSTEM";

export interface IConversationMember {
  userId: Types.ObjectId;
  lastReadMessageId?: Types.ObjectId;
  joinedAt: Date;
}

export interface IConversation extends Document {
  type: ConversationType;
  title?: string;
  createdBy?: Types.ObjectId;
  participants: Types.ObjectId[];
  members: IConversationMember[];
  recruiter?: Types.ObjectId;
  jobSeeker?: Types.ObjectId;
  jobId?: Types.ObjectId;
  lastMessage?: Types.ObjectId;
  lastMessageAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAttachment {
  url: string;
  fileType: string;
  fileName: string;
  fileSize?: number;
}

export type MessageType = "text" | "image" | "file" | "system";

export interface IMessageRead {
  userId: Types.ObjectId;
  readAt: Date;
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  sender: Types.ObjectId;
  message: string;
  messageType: MessageType;
  attachments?: IAttachment[];
  reads: IMessageRead[];
  replyTo?: Types.ObjectId;
  isEdited: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
