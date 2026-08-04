import { MessageType } from "../../database/models/chat";

export interface CreateConversationDto {
  jobId: string;
  applicantId: string; // Required if caller is recruiter; if caller is jobSeeker, candidate is caller
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
  before?: string; // ISO date string or Message ID for cursor pagination
}

export interface SearchMessagesQueryDto {
  query: string;
}
