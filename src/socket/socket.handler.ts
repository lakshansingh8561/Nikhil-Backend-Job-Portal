import { Server } from "socket.io";
import { AuthenticatedSocket } from "./socket.auth.middleware";
import { ChatService } from "../features/chat/chat.service";
import { Conversation, Message } from "../database/models";

// Active online user sockets: Map<userId, Set<socketId>>
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

    // Broadcast updated list of online user IDs to all sockets
    const currentOnlineUserIds = Array.from(onlineUsers.keys());
    io.emit("online-users", currentOnlineUserIds);
    io.emit("online_users", currentOnlineUserIds);
    socket.broadcast.emit("user_online", { userId });

    // Join Conversation Room
    const handleJoinConversation = async (data: { conversationId: string }) => {
      try {
        if (!data.conversationId) return;

        const conversation = await Conversation.findOne({
          _id: data.conversationId,
          "members.userId": userId,
        });

        if (!conversation) {
          socket.emit("error", { message: "Access denied to conversation" });
          return;
        }

        // Join both room patterns
        socket.join(`conversation:${data.conversationId}`);
        socket.join(`conversation_${data.conversationId}`);

        // Check if other member is online
        const otherMember = conversation.members.find(
          (m: any) => m.userId.toString() !== userId
        );
        const otherParticipantId = otherMember?.userId?.toString();

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
    };

    socket.on("join-conversation", handleJoinConversation);
    socket.on("join_conversation", handleJoinConversation);

    // Leave Conversation Room
    const handleLeaveConversation = (data: { conversationId: string }) => {
      if (!data.conversationId) return;
      socket.leave(`conversation:${data.conversationId}`);
      socket.leave(`conversation_${data.conversationId}`);
    };

    socket.on("leave-conversation", handleLeaveConversation);
    socket.on("leave_conversation", handleLeaveConversation);

    // Send Message
    const handleSendMessage = async (data: {
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

        // Broadcast to conversation rooms
        const room1 = `conversation:${data.conversationId}`;
        const room2 = `conversation_${data.conversationId}`;

        io.to(room1).to(room2).emit("receive-message", message);
        io.to(room1).to(room2).emit("receive_message", message);
      } catch (err: any) {
        socket.emit("error", {
          message: err.message || "Failed to send message",
        });
      }
    };

    socket.on("send-message", handleSendMessage);
    socket.on("send_message", handleSendMessage);

    // Typing Handlers
    const handleTyping = (data: { conversationId: string; receiverId?: string }) => {
      const room1 = `conversation:${data.conversationId}`;
      const room2 = `conversation_${data.conversationId}`;
      socket.to(room1).to(room2).emit("typing", {
        conversationId: data.conversationId,
        userId,
      });
    };

    const handleStopTyping = (data: { conversationId: string; receiverId?: string }) => {
      const room1 = `conversation:${data.conversationId}`;
      const room2 = `conversation_${data.conversationId}`;
      socket.to(room1).to(room2).emit("stop-typing", {
        conversationId: data.conversationId,
        userId,
      });
      socket.to(room1).to(room2).emit("stop_typing", {
        conversationId: data.conversationId,
        userId,
      });
    };

    socket.on("typing", handleTyping);
    socket.on("stop-typing", handleStopTyping);
    socket.on("stop_typing", handleStopTyping);

    // Message Seen / Read Handler
    const handleMessageSeen = async (data: { conversationId: string }) => {
      try {
        await ChatService.markAsRead(userId, data.conversationId);

        const room1 = `conversation:${data.conversationId}`;
        const room2 = `conversation_${data.conversationId}`;
        const seenAt = new Date();

        const payload = {
          conversationId: data.conversationId,
          readBy: userId,
          readAt: seenAt,
          seenAt,
          status: "seen",
        };

        io.to(room1).to(room2).emit("message-seen", payload);
        io.to(room1).to(room2).emit("message_read", payload);

        // Update user unread count
        const conversation = await Conversation.findById(data.conversationId);
        if (conversation) {
          conversation.members.forEach((m: any) => {
            const pId = m.userId.toString();
            io.to(`user:${pId}`).emit("unread-count-updated", {
              conversationId: data.conversationId,
            });
            io.to(`user:${pId}`).emit("unread_count_updated", {
              conversationId: data.conversationId,
            });
          });
        }
      } catch (err: any) {
        socket.emit("error", { message: err.message });
      }
    };

    socket.on("message-seen", handleMessageSeen);
    socket.on("message_read", handleMessageSeen);

    // Message Delivered Handler
    const handleMessageDelivered = async (data: { conversationId: string; messageId: string }) => {
      try {
        const deliveredAt = new Date();
        await Message.findByIdAndUpdate(data.messageId, {
          status: "delivered",
          delivered: true,
          deliveredAt,
        });

        const room1 = `conversation:${data.conversationId}`;
        const room2 = `conversation_${data.conversationId}`;
        const payload = {
          conversationId: data.conversationId,
          messageId: data.messageId,
          deliveredAt,
          status: "delivered",
        };

        io.to(room1).to(room2).emit("message-delivered", payload);
        io.to(room1).to(room2).emit("message_delivered", payload);
      } catch (err: any) {
        socket.emit("error", { message: err.message });
      }
    };

    socket.on("message-delivered", handleMessageDelivered);
    socket.on("message_delivered", handleMessageDelivered);

    // Check Online Status of User
    socket.on("check_online_status", (targetUserId: string) => {
      const isOnline =
        onlineUsers.has(targetUserId) &&
        onlineUsers.get(targetUserId)!.size > 0;
      socket.emit("online_status_response", { userId: targetUserId, isOnline });
    });

    // Handle Disconnect
    socket.on("disconnect", () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);

          // Broadcast updated online users list
          const updatedOnlineUserIds = Array.from(onlineUsers.keys());
          io.emit("online-users", updatedOnlineUserIds);
          io.emit("online_users", updatedOnlineUserIds);
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
