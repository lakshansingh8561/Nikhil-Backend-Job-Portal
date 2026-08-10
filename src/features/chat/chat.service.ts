import { Types } from "mongoose";
import {
  Conversation,
  Message,
  User,
  UserProfile,
  RecruiterProfile,
  JobSeekerProfile,
  Job,
} from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { CHAT_MESSAGES } from "./chat.constants";
import { NotificationService } from "../notifications/notification.service";
import {
  CreateConversationDto,
  SendMessageDto,
  EditMessageDto,
  GetMessagesQueryDto,
} from "./chat.types";
import { Role } from "../../common/enums/role.enum";

export class ChatService {
  /**
   * Helper to fetch unified recipient identity from User & UserProfile
   */
  private static async getRecipientIdentity(targetUserId: string) {
    if (!targetUserId) {
      return {
        userId: "",
        email: "",
        role: "",
        name: "User",
        firstName: "User",
        lastName: "",
        profilePicture: "",
        headline: "",
        companyName: "",
      };
    }

    const targetUser = await User.findById(targetUserId).select("email role status").lean();
    const profile = await UserProfile.findOne({ userId: targetUserId }).lean();
    const recruiterProf = await RecruiterProfile.findOne({ userId: targetUserId })
      .populate("companyId", "name companyName logo")
      .lean();

    const firstName = profile?.firstName || (targetUser?.email ? targetUser.email.split("@")[0] : "User");
    const lastName = profile?.lastName || "";
    const name = `${firstName} ${lastName}`.trim();
    const profilePicture = profile?.profilePicture || "";
    const headline = profile?.headline || recruiterProf?.designation || (targetUser?.role === Role.RECRUITER ? "Recruiter" : "Job Applicant");
    const companyName = (recruiterProf?.companyId as any)?.name || (recruiterProf?.companyId as any)?.companyName || recruiterProf?.currentCompany || "";

    return {
      userId: targetUserId,
      email: targetUser?.email || "",
      role: targetUser?.role || "",
      name,
      firstName,
      lastName,
      profilePicture,
      headline,
      companyName,
    };
  }

  /**
   * Create or fetch existing 1-on-1 conversation
   */
  static async createOrGetConversation(
    userId: string,
    userRole: Role,
    data: CreateConversationDto
  ) {
    if (userRole === Role.ADMIN) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        CHAT_MESSAGES.ADMIN_CHAT_FORBIDDEN
      );
    }

    let recipientId = data.recipientId || data.applicantId || data.recruiterId;

    // Auto-resolve recruiter from jobId if recipientId wasn't passed directly
    if (!recipientId && data.jobId) {
      const job = await Job.findById(data.jobId).lean();
      if (job) {
        const recId = (job as any).userId;
        if (recId) {
          recipientId = recId.toString();
        }
      }
    }

    // Fallback: Find an active recruiter or candidate user if recipientId is still missing
    if (!recipientId) {
      const fallbackTargetRole = userRole === Role.JOB_SEEKER ? Role.RECRUITER : Role.JOB_SEEKER;
      const fallbackUser = await User.findOne({
        _id: { $ne: new Types.ObjectId(userId) },
        role: fallbackTargetRole,
        isDeleted: { $ne: true },
      }).lean();

      if (fallbackUser) {
        recipientId = fallbackUser._id.toString();
      }
    }

    if (!recipientId) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        CHAT_MESSAGES.INVALID_PARTICIPANTS
      );
    }

    if (userId === recipientId) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        CHAT_MESSAGES.CANNOT_CHAT_SELF
      );
    }

    const targetUser = await User.findById(recipientId);
    if (!targetUser) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.RECIPIENT_NOT_FOUND
      );
    }

    let conversation = await Conversation.findOne({
      $or: [
        { participants: { $all: [new Types.ObjectId(userId), new Types.ObjectId(recipientId)] } },
        { "members.userId": { $all: [new Types.ObjectId(userId), new Types.ObjectId(recipientId)] } },
      ],
      isDeleted: { $ne: true },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        type: "DIRECT",
        createdBy: new Types.ObjectId(userId),
        participants: [new Types.ObjectId(userId), new Types.ObjectId(recipientId)],
        members: [
          { userId: new Types.ObjectId(userId), joinedAt: new Date() },
          { userId: new Types.ObjectId(recipientId), joinedAt: new Date() },
        ],
        jobId: data.jobId ? new Types.ObjectId(data.jobId) : null,
      });
    }

    return this.getConversationById(userId, conversation.id);
  }

  /**
   * Get all conversations for current user
   */
  static async getUserConversations(userId: string, userRole: Role) {
    if (userRole === Role.ADMIN) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        CHAT_MESSAGES.ADMIN_CHAT_FORBIDDEN
      );
    }

    const conversations = await Conversation.find({
      $or: [
        { participants: new Types.ObjectId(userId) },
        { "members.userId": new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    })
      .populate("jobId", "title companyId location")
      .populate("lastMessage")
      .sort({ updatedAt: -1 })
      .lean();

    const formattedConversations = await Promise.all(
      conversations.map(async (conv) => {
        let targetUserId = "";

        if (conv.participants && conv.participants.length > 0) {
          const otherP = conv.participants.find(
            (p: any) => p.toString() !== userId
          );
          if (otherP) targetUserId = otherP.toString();
        }

        if (!targetUserId && conv.members && conv.members.length > 0) {
          const otherMember = conv.members.find(
            (m: any) => m.userId.toString() !== userId
          );
          if (otherMember) {
            targetUserId = otherMember.userId.toString();
          }
        }

        const recipient = await this.getRecipientIdentity(targetUserId);

        const unreadCount = await Message.countDocuments({
          conversationId: conv._id,
          sender: { $ne: new Types.ObjectId(userId) },
          "reads.userId": { $ne: new Types.ObjectId(userId) },
        });

        return {
          ...conv,
          id: conv._id.toString(),
          recipient,
          unreadCount,
        };
      })
    );

    return formattedConversations;
  }

  /**
   * Get single conversation details by ID
   */
  static async getConversationById(userId: string, conversationId: string) {
    const conv = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: new Types.ObjectId(userId) },
        { "members.userId": new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    })
      .populate("jobId", "title companyId location userId")
      .populate("lastMessage")
      .lean();

    if (!conv) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.CONVERSATION_NOT_FOUND
      );
    }

    let targetUserId = "";
    if (conv.participants && conv.participants.length > 0) {
      const otherP = conv.participants.find(
        (p: any) => p.toString() !== userId
      );
      if (otherP) targetUserId = otherP.toString();
    }

    if (!targetUserId && conv.members && conv.members.length > 0) {
      const otherMember = conv.members.find(
        (m: any) => m.userId.toString() !== userId
      );
      if (otherMember) targetUserId = otherMember.userId.toString();
    }

    const recipient = await this.getRecipientIdentity(targetUserId);

    const unreadCount = await Message.countDocuments({
      conversationId: conv._id,
      sender: { $ne: new Types.ObjectId(userId) },
      "reads.userId": { $ne: new Types.ObjectId(userId) },
    });

    return {
      ...conv,
      id: conv._id.toString(),
      recipient,
      unreadCount,
    };
  }

  /**
   * Get paginated messages for conversation
   */
  static async getMessages(
    userId: string,
    conversationId: string,
    query: GetMessagesQueryDto
  ) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: new Types.ObjectId(userId) },
        { "members.userId": new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    });

    if (!conversation) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.CONVERSATION_NOT_FOUND
      );
    }

    const limit = Math.min(Number(query.limit) || 30, 100);
    const filter: any = { conversationId };

    if (query.before) {
      if (Types.ObjectId.isValid(query.before)) {
        filter._id = { $lt: new Types.ObjectId(query.before) };
      } else if (!isNaN(Date.parse(query.before))) {
        filter.createdAt = { $lt: new Date(query.before) };
      }
    }

    const messages = await Message.find(filter)
      .populate("replyTo", "message sender isDeleted")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const chronologicalMessages = messages.reverse().map((msg) => {
      const readsArr = (msg as any).reads || [];
      const senderStr = msg.sender ? msg.sender.toString() : "";
      
      const isSeenByRecipient = readsArr.some(
        (r: any) => r.userId && r.userId.toString() !== senderStr
      );

      const isDelivered = (msg as any).status === "delivered" || (msg as any).delivered || readsArr.length > 0;

      const status = isSeenByRecipient
        ? "seen"
        : isDelivered
        ? "delivered"
        : "sent";

      return {
        ...msg,
        id: msg._id.toString(),
        status,
        read: isSeenByRecipient,
        delivered: isDelivered,
        reads: readsArr,
      };
    });

    return {
      messages: chronologicalMessages,
      hasMore: messages.length === limit,
    };
  }

  /**
   * Send a new message
   */
  static async sendMessage(
    userId: string,
    conversationId: string,
    data: SendMessageDto
  ) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: new Types.ObjectId(userId) },
        { "members.userId": new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    });

    if (!conversation) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.CONVERSATION_NOT_FOUND
      );
    }

    const message = await Message.create({
      conversationId: new Types.ObjectId(conversationId),
      sender: new Types.ObjectId(userId),
      message: data.message.trim(),
      messageType: data.messageType || "text",
      attachments: data.attachments || [],
      reads: [{ userId: new Types.ObjectId(userId), readAt: new Date() }],
      replyTo: data.replyTo ? new Types.ObjectId(data.replyTo) : null,
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastMessageAt: message.createdAt,
    });

    // Dispatch Bidirectional Chat In-App Notification to Recipient
    try {
      let recipientId = "";
      if (conversation.participants && conversation.participants.length > 0) {
        const otherP = conversation.participants.find((p: any) => p.toString() !== userId);
        if (otherP) recipientId = otherP.toString();
      }
      if (!recipientId && conversation.members && conversation.members.length > 0) {
        const otherM = conversation.members.find((m: any) => m.userId.toString() !== userId);
        if (otherM) recipientId = otherM.userId.toString();
      }

      if (recipientId) {
        const senderUser = await User.findById(userId).select("role email").lean();
        const senderProfile = await UserProfile.findOne({ userId }).lean();
        const senderRecruiter = await RecruiterProfile.findOne({ userId }).populate("companyId", "name companyName").lean();

        const senderFirstName = senderProfile?.firstName || (senderUser?.email ? senderUser.email.split("@")[0] : "User");
        const senderLastName = senderProfile?.lastName || "";
        const senderName = `${senderFirstName} ${senderLastName}`.trim();
        const companyName = (senderRecruiter?.companyId as any)?.name || (senderRecruiter?.companyId as any)?.companyName || "";

        const isRecruiterSender = senderUser?.role === Role.RECRUITER;
        
        const title = isRecruiterSender
          ? `New Message from Recruiter (${companyName || senderName})`
          : `New Message from Candidate (${senderName})`;

        const link = isRecruiterSender
          ? `/job-seeker/messages?conversationId=${conversationId}`
          : `/recruiter/messages?conversationId=${conversationId}`;

        const msgText = data.message.trim();
        const excerpt = msgText.length > 60 ? `${msgText.substring(0, 60)}...` : msgText;

        await NotificationService.createNotification({
          recipientId,
          senderId: userId,
          type: "CHAT_MESSAGE",
          title,
          message: `${senderName}: "${excerpt}"`,
          link,
        });
      }
    } catch (notifErr) {
      console.error("[ChatService] Failed to dispatch chat notification:", notifErr);
    }

    const populatedMessage = await Message.findById(message._id)
      .populate("replyTo", "message sender isDeleted")
      .lean();

    return {
      ...populatedMessage,
      id: message._id.toString(),
      status: "delivered",
      delivered: true,
      read: false,
    };
  }

  /**
   * Edit an existing message within 10 minutes
   */
  static async editMessage(
    userId: string,
    messageId: string,
    data: EditMessageDto
  ) {
    const message = await Message.findById(messageId);

    if (!message || message.sender.toString() !== userId) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.MESSAGE_NOT_FOUND
      );
    }

    if (message.isDeleted) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Cannot edit a deleted message"
      );
    }

    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const timeElapsed = Date.now() - new Date(message.createdAt).getTime();

    if (timeElapsed > TEN_MINUTES_MS) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        CHAT_MESSAGES.CANNOT_EDIT_MESSAGE
      );
    }

    message.message = data.message.trim();
    message.isEdited = true;
    await message.save();

    return {
      ...message.toObject(),
      id: message._id.toString(),
    };
  }

  /**
   * Soft delete a message for sender
   */
  static async deleteMessage(userId: string, messageId: string) {
    const message = await Message.findById(messageId);

    if (!message || message.sender.toString() !== userId) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.MESSAGE_NOT_FOUND
      );
    }

    message.message = "This message was deleted";
    message.isDeleted = true;
    message.attachments = [];
    await message.save();

    return {
      ...message.toObject(),
      id: message._id.toString(),
    };
  }

  /**
   * Mark messages in conversation as read
   */
  static async markAsRead(userId: string, conversationId: string) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: new Types.ObjectId(userId) },
        { "members.userId": new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    });

    if (!conversation) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.CONVERSATION_NOT_FOUND
      );
    }

    const now = new Date();
    await Message.updateMany(
      {
        conversationId,
        sender: { $ne: new Types.ObjectId(userId) },
        "reads.userId": { $ne: new Types.ObjectId(userId) },
      },
      {
        $push: {
          reads: { userId: new Types.ObjectId(userId), readAt: now },
        },
      }
    );

    return { conversationId, success: true };
  }

  /**
   * Get total unread count for user across all user's conversations ONLY
   */
  static async getUnreadCount(userId: string, userRole: Role) {
    if (userRole === Role.ADMIN) return { unreadCount: 0 };

    const myConversations = await Conversation.find({
      $or: [
        { participants: new Types.ObjectId(userId) },
        { "members.userId": new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    }).select("_id");

    const conversationIds = myConversations.map((c) => c._id);

    if (conversationIds.length === 0) {
      return { unreadCount: 0 };
    }

    const totalUnread = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      sender: { $ne: new Types.ObjectId(userId) },
      "reads.userId": { $ne: new Types.ObjectId(userId) },
    });

    return { unreadCount: totalUnread };
  }

  /**
   * Search messages within a conversation
   */
  static async searchMessages(
    userId: string,
    conversationId: string,
    query: string
  ) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: new Types.ObjectId(userId) },
        { "members.userId": new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    });

    if (!conversation) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.CONVERSATION_NOT_FOUND
      );
    }

    const messages = await Message.find({
      conversationId,
      message: { $regex: query, $options: "i" },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    return messages.map((m) => ({ ...m, id: m._id.toString() }));
  }

  /**
   * Soft delete an entire conversation for the current user
   */
  static async deleteConversation(userId: string, conversationId: string) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: new Types.ObjectId(userId) },
        { "members.userId": new Types.ObjectId(userId) },
      ],
    });

    if (!conversation) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.CONVERSATION_NOT_FOUND
      );
    }

    conversation.isDeleted = true;
    conversation.deletedAt = new Date();
    await conversation.save();

    return { conversationId };
  }
}
