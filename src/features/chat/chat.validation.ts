import { z } from "zod";

const createConversation = z.object({
  jobId: z.string().min(1, "jobId is required"),
  applicantId: z.string().optional(),
});

const sendMessage = z.object({
  message: z.string().min(1, "Message text is required"),
  messageType: z.enum(["text", "image", "file"]).optional().default("text"),
  attachments: z
    .array(
      z.object({
        url: z.string().url(),
        fileType: z.string(),
        fileName: z.string(),
      })
    )
    .optional(),
  replyTo: z.string().optional(),
});

const editMessage = z.object({
  message: z.string().min(1, "Message text is required"),
});

export const ChatValidation = {
  createConversation,
  sendMessage,
  editMessage,
};
