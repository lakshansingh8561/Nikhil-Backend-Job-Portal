import { MessageType } from "../../database/models/chat";

export interface CreateConversationDto {
  jobId?: string;
  applicantId?: string;
  recruiterId?: string;
  recipientId?: string;
}

export interface SendMessageDto {
  message: string;
  messageType?: MessageType;
  attachments?: {
    url: string;
    fileType: string;
    fileName: string;
  }[];
  replyTo?: string;
}

export interface EditMessageDto {
  message: string;
}

export interface GetMessagesQueryDto {
  limit?: number;
  before?: string;
}

export interface SearchMessagesQueryDto {
  query: string;
}
