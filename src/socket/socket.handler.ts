import { Server } from "socket.io";
import { AuthenticatedSocket } from "./socket.auth.middleware";
import { ChatService } from "../features/chat/chat.service";
import { Conversation, Message } from "../database/models";

// Track active online sockets per userId: Map<userId, Set<socketId>>
const onlineUsers = new Map<string, Set<string>>();

export const setupSocketHandlers = (io: Server) => {
  io.on("connection", async (socket: AuthenticatedSocket) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const userId = user.userId;

    // Register active socket for user
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Join personal user room for direct messaging & notifications
    socket.join(`user:${userId}`);

    // Send current list of all online user IDs to newly connected socket
    socket.emit("initial_online_users", Array.from(onlineUsers.keys()));

    // Broadcast online status to all user's conversation recipients
    socket.broadcast.emit("user_online", { userId });

    // Handle join conversation room
    socket.on("join_conversation", async (data: { conversationId: string }) => {
      try {
        const conversation = await Conversation.findOne({
          _id: data.conversationId,
          participants: userId,
        });

        if (!conversation) {
          socket.emit("error", { message: "Access denied to conversation" });
          return;
        }

        socket.join(`conversation:${data.conversationId}`);

        // Check online status of other participant
        const otherParticipantId = conversation.participants
          .find((p) => p.toString() !== userId)
          ?.toString();

        const isOtherOnline = otherParticipantId
          ? onlineUsers.has(otherParticipantId) &&
            onlineUsers.get(otherParticipantId)!.size > 0
          : false;

        socket.emit("conversation_joined", {
          conversationId: data.conversationId,
          recipientOnline: isOtherOnline,
        });
      } catch (err: any) {
        socket.emit("error", { message: err.message || "Failed to join conversation" });
      }
    });

    // Handle leave conversation room
    socket.on("leave_conversation", (data: { conversationId: string }) => {
      socket.leave(`conversation:${data.conversationId}`);
    });

    // Handle send message
    socket.on(
      "send_message",
      async (data: {
        conversationId: string;
        message: string;
        messageType?: "text" | "image" | "file";
        attachments?: any[];
        replyTo?: string;
      }) => {
        try {
          const message = await ChatService.sendMessage(
            userId,
            data.conversationId,
            {
              message: data.message,
              messageType: data.messageType,
              attachments: data.attachments,
              replyTo: data.replyTo,
            }
          );

          // Emit to recipient's personal user room so recipient updates conversation list/unread count
          const receiverId = (message.receiver as any)?.toString();
          if (receiverId) {
            const isReceiverOnline =
              onlineUsers.has(receiverId) &&
              onlineUsers.get(receiverId)!.size > 0;

            if (isReceiverOnline) {
              await Message.findByIdAndUpdate(message._id || message.id, {
                delivered: true,
                deliveredAt: new Date(),
              });
              (message as any).delivered = true;
              (message as any).deliveredAt = new Date();
            }

            io.to(`user:${receiverId}`).emit("conversation_updated", {
              conversationId: data.conversationId,
              message,
            });
          }

          // Broadcast to conversation room with updated delivery status
          io.to(`conversation:${data.conversationId}`).emit(
            "receive_message",
            message
          );


          // Also notify sender
          io.to(`user:${userId}`).emit("conversation_updated", {
            conversationId: data.conversationId,
            message,
          });
        } catch (err: any) {
          socket.emit("error", {
            message: err.message || "Failed to send message",
          });
        }
      }
    );

    // Handle typing status
    socket.on(
      "typing",
      (data: { conversationId: string; receiverId?: string }) => {
        socket
          .to(`conversation:${data.conversationId}`)
          .emit("typing", { conversationId: data.conversationId, userId });
      }
    );

    socket.on(
      "stop_typing",
      (data: { conversationId: string; receiverId?: string }) => {
        socket
          .to(`conversation:${data.conversationId}`)
          .emit("stop_typing", { conversationId: data.conversationId, userId });
      }
    );

    // Handle message read status
    socket.on(
      "message_read",
      async (data: { conversationId: string; messageIds?: string[] }) => {
        try {
          await ChatService.markAsRead(userId, data.conversationId);

          io.to(`conversation:${data.conversationId}`).emit("message_read", {
            conversationId: data.conversationId,
            readBy: userId,
            readAt: new Date(),
          });

          // Also update user's unread counts in user rooms
          const conversation = await Conversation.findById(data.conversationId);
          if (conversation) {
            conversation.participants.forEach((pId) => {
              io.to(`user:${pId.toString()}`).emit("unread_count_updated", {
                conversationId: data.conversationId,
              });
            });
          }
        } catch (err: any) {
          socket.emit("error", { message: err.message });
        }
      }
    );

    // Handle message delivery status
    socket.on(
      "message_delivered",
      async (data: { conversationId: string; messageId: string }) => {
        try {
          await Message.findByIdAndUpdate(data.messageId, {
            delivered: true,
            deliveredAt: new Date(),
          });

          io.to(`conversation:${data.conversationId}`).emit(
            "message_delivered",
            {
              conversationId: data.conversationId,
              messageId: data.messageId,
              deliveredAt: new Date(),
            }
          );
        } catch (err: any) {
          socket.emit("error", { message: err.message });
        }
      }
    );

    // Check if a specific user is online
    socket.on("check_online_status", (targetUserId: string) => {
      const isOnline =
        onlineUsers.has(targetUserId) &&
        onlineUsers.get(targetUserId)!.size > 0;
      socket.emit("online_status_response", { userId: targetUserId, isOnline });
    });

    // Handle socket disconnect
    socket.on("disconnect", () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          // Broadcast user offline to all clients
          io.emit("user_offline", {
            userId,
            lastSeen: new Date(),
          });
        }
      }
    });
  });
};

export const getOnlineUsers = () => onlineUsers;
