import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { ChatService } from "./chat.service";
import { CHAT_MESSAGES } from "./chat.constants";
import { getIO, getOnlineUsers } from "../../socket";
import { Message } from "../../database/models";

export class ChatController {
  static createOrGetConversation = asyncHandler(
    async (req: Request, res: Response) => {
      const conversation = await ChatService.createOrGetConversation(
        req.user.userId,
        req.user.role,
        req.body
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.CONVERSATION_CREATED,
          conversation
        )
      );
    }
  );

  static getUserConversations = asyncHandler(
    async (req: Request, res: Response) => {
      const conversations = await ChatService.getUserConversations(
        req.user.userId,
        req.user.role
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.CONVERSATIONS_FETCHED,
          conversations
        )
      );
    }
  );

  static getConversationById = asyncHandler(
    async (req: Request, res: Response) => {
      const conversation = await ChatService.getConversationById(
        req.user.userId,
        req.params.id as string
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.CONVERSATION_FETCHED,
          conversation
        )
      );
    }
  );

  static getMessages = asyncHandler(
    async (req: Request, res: Response) => {
      const result = await ChatService.getMessages(
        req.user.userId,
        req.params.id as string,
        req.query
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.MESSAGES_FETCHED,
          result
        )
      );
    }
  );

  static sendMessage = asyncHandler(
    async (req: Request, res: Response) => {
      const message = await ChatService.sendMessage(
        req.user.userId,
        req.params.id as string,
        req.body
      );

      try {
        const io = getIO();
        const conversationId = req.params.id as string;
        const receiverId = (message.receiver as any)?.toString();
        const onlineUsersMap = getOnlineUsers();

        const isReceiverOnline =
          receiverId &&
          onlineUsersMap.has(receiverId) &&
          onlineUsersMap.get(receiverId)!.size > 0;

        if (isReceiverOnline) {
          const now = new Date();
          await Message.findByIdAndUpdate(message._id || message.id, {
            status: "delivered",
            delivered: true,
            deliveredAt: now,
          });
          (message as any).status = "delivered";
          (message as any).delivered = true;
          (message as any).deliveredAt = now;
        }

        if (io) {
          const convRoom1 = `conversation:${conversationId}`;
          const convRoom2 = `conversation_${conversationId}`;

          io.to(convRoom1).to(convRoom2).emit("receive-message", message);
          io.to(convRoom1).to(convRoom2).emit("receive_message", message);

          if (receiverId) {
            io.to(`user:${receiverId}`).emit("conversation-updated", {
              conversationId,
              message,
            });
            io.to(`user:${receiverId}`).emit("conversation_updated", {
              conversationId,
              message,
            });
          }
          io.to(`user:${req.user.userId}`).emit("conversation-updated", {
            conversationId,
            message,
          });
          io.to(`user:${req.user.userId}`).emit("conversation_updated", {
            conversationId,
            message,
          });
        }
      } catch (err) {
        console.warn("Socket broadcast warning in sendMessage:", err);
      }

      res.status(HTTP_STATUS.CREATED).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.MESSAGE_SENT,
          message
        )
      );
    }
  );

  static editMessage = asyncHandler(
    async (req: Request, res: Response) => {
      const message = await ChatService.editMessage(
        req.user.userId,
        req.params.id as string,
        req.body
      );

      try {
        const io = getIO();
        if (io) {
          const conversationId = (message.conversationId as any)?.toString() || req.params.id;
          io.to(`conversation:${conversationId}`).emit("message_edited", message);
          io.to(`conversation:${conversationId}`).emit("receive_message", message);
        }
      } catch (err) {
        console.warn("Socket broadcast warning in editMessage:", err);
      }

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.MESSAGE_EDITED,
          message
        )
      );
    }
  );

  static deleteMessage = asyncHandler(
    async (req: Request, res: Response) => {
      const message = await ChatService.deleteMessage(
        req.user.userId,
        req.params.id as string
      );

      try {
        const io = getIO();
        if (io) {
          const conversationId = (message.conversationId as any)?.toString() || req.params.id;
          io.to(`conversation:${conversationId}`).emit("message_deleted", message);
          io.to(`conversation:${conversationId}`).emit("receive_message", message);
        }
      } catch (err) {
        console.warn("Socket broadcast warning in deleteMessage:", err);
      }

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.MESSAGE_DELETED,
          message
        )
      );
    }
  );

  static markAsRead = asyncHandler(
    async (req: Request, res: Response) => {
      const result = await ChatService.markAsRead(
        req.user.userId,
        req.params.id as string
      );

      try {
        const io = getIO();
        if (io) {
          const conversationId = req.params.id as string;
          io.to(`conversation:${conversationId}`).emit("message_read", {
            conversationId,
            readBy: req.user.userId,
            readAt: new Date(),
          });
        }
      } catch (err) {
        console.warn("Socket broadcast warning in markAsRead:", err);
      }

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.MESSAGES_MARKED_READ,
          result
        )
      );
    }
  );

  static getUnreadCount = asyncHandler(
    async (req: Request, res: Response) => {
      const result = await ChatService.getUnreadCount(
        req.user.userId,
        req.user.role
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.UNREAD_COUNT_FETCHED,
          result
        )
      );
    }
  );

  static searchMessages = asyncHandler(
    async (req: Request, res: Response) => {
      const query = (req.query.query as string) || "";
      const messages = await ChatService.searchMessages(
        req.user.userId,
        req.params.id as string,
        query
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          CHAT_MESSAGES.MESSAGES_FETCHED,
          messages
        )
      );
    }
  );
}
