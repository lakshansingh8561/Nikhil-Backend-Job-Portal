import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { ChatService } from "./chat.service";
import { CHAT_MESSAGES } from "./chat.constants";

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
