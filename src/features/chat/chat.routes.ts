import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { ChatController } from "./chat.controller";
import { ChatValidation } from "./chat.validation";

const sendMessageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP / user to 30 message requests per minute
  message: {
    success: false,
    message: "Too many messages sent. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

// All chat routes require authentication
router.use(authenticate);

// Unread count route
router.get("/unread-count", ChatController.getUnreadCount);

// Conversations routes
router.post(
  "/conversations",
  validate(ChatValidation.createConversation),
  ChatController.createOrGetConversation
);
router.get("/conversations", ChatController.getUserConversations);
router.get("/conversations/:id", ChatController.getConversationById);

// Message routes within conversation
router.get("/conversations/:id/messages", ChatController.getMessages);
router.post(
  "/conversations/:id/messages",
  sendMessageLimiter,
  validate(ChatValidation.sendMessage),
  ChatController.sendMessage
);
router.patch(
  "/conversations/:id/read",
  ChatController.markAsRead
);
router.get(
  "/conversations/:id/messages/search",
  ChatController.searchMessages
);

// Individual message routes
router.patch(
  "/messages/:id",
  validate(ChatValidation.editMessage),
  ChatController.editMessage
);
router.delete("/messages/:id", ChatController.deleteMessage);

export const chatRoutes = router;
