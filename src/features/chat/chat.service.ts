import { Types } from "mongoose";
import {
  Conversation,
  Message,
  Application,
  Job,
  JobSeekerProfile,
  RecruiterProfile,
  User,
} from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { CHAT_MESSAGES } from "./chat.constants";
import {
  CreateConversationDto,
  SendMessageDto,
  EditMessageDto,
  GetMessagesQueryDto,
} from "./chat.types";

export class ChatService {
  /**
   * Create or Get existing conversation between JobSeeker and Recruiter for a specific Job
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

    const { jobId, applicantId } = data;

    const job = await Job.findById(jobId);
    if (!job) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Job not found");
    }

    let jobSeekerId: string;
    let recruiterId: string;

    if (userRole === Role.JOB_SEEKER) {
      jobSeekerId = userId;
      recruiterId = job.recruiterId.toString();
    } else if (userRole === Role.RECRUITER) {
      if (!applicantId) {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          "applicantId is required for recruiter to start conversation"
        );
      }
      if (job.recruiterId.toString() !== userId) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          "You are not the recruiter for this job posting"
        );
      }
      jobSeekerId = applicantId;
      recruiterId = userId;
    } else {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        CHAT_MESSAGES.ADMIN_CHAT_FORBIDDEN
      );
    }

    // Verify Application exists
    const application = await Application.findOne({
      jobId,
      applicantId: jobSeekerId,
    });

    if (!application) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        CHAT_MESSAGES.APPLICATION_REQUIRED
      );
    }

    // Find existing conversation
    let conversation = await Conversation.findOne({
      jobId,
      jobSeeker: jobSeekerId,
      recruiter: recruiterId,
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [
          new Types.ObjectId(recruiterId),
          new Types.ObjectId(jobSeekerId),
        ],
        recruiter: new Types.ObjectId(recruiterId),
        jobSeeker: new Types.ObjectId(jobSeekerId),
        jobId: new Types.ObjectId(jobId),
        unreadCounts: { jobSeeker: 0, recruiter: 0 },
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
      participants: userId,
    })
      .populate("jobId", "title companyId location")
      .populate("lastMessage")
      .sort({ updatedAt: -1 })
      .lean();

    // Attach recipient profile and user details
    const formattedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const isUserJobSeeker = conv.jobSeeker.toString() === userId;
        const targetUserId = isUserJobSeeker
          ? conv.recruiter.toString()
          : conv.jobSeeker.toString();

        const targetUser = await User.findById(targetUserId).select(
          "email role status"
        );

        let recipientProfile: any = null;
        if (isUserJobSeeker) {
          const profile = await RecruiterProfile.findOne({
            userId: targetUserId,
          })
            .populate("companyId", "name logo")
            .lean();
          if (profile) {
            recipientProfile = {
              name: `${profile.firstName} ${profile.lastName}`,
              firstName: profile.firstName,
              lastName: profile.lastName,
              profilePicture: profile.profilePicture || "",
              headline: profile.headline || profile.designation || "Recruiter",
              companyName:
                (profile.companyId as any)?.name || profile.currentCompany || "",
            };
          }
        } else {
          const profile = await JobSeekerProfile.findOne({
            userId: targetUserId,
          }).lean();
          if (profile) {
            recipientProfile = {
              name: `${profile.firstName} ${profile.lastName}`,
              firstName: profile.firstName,
              lastName: profile.lastName,
              profilePicture: profile.profilePicture || "",
              headline: profile.headline || "Job Applicant",
            };
          }
        }

        if (!recipientProfile) {
          recipientProfile = {
            name: targetUser?.email ? targetUser.email.split("@")[0] : "User",
            firstName: "User",
            lastName: "",
            profilePicture: "",
            headline: "",
          };
        }

        const unreadCount = isUserJobSeeker
          ? conv.unreadCounts?.jobSeeker || 0
          : conv.unreadCounts?.recruiter || 0;

        return {
          ...conv,
          id: conv._id.toString(),
          recipient: {
            userId: targetUserId,
            email: targetUser?.email || "",
            role: targetUser?.role || "",
            ...recipientProfile,
          },
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
      participants: userId,
    })
      .populate("jobId", "title companyId location recruiterId")
      .populate("lastMessage")
      .lean();

    if (!conv) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.CONVERSATION_NOT_FOUND
      );
    }

    const isUserJobSeeker = conv.jobSeeker.toString() === userId;
    const targetUserId = isUserJobSeeker
      ? conv.recruiter.toString()
      : conv.jobSeeker.toString();

    const targetUser = await User.findById(targetUserId).select(
      "email role status"
    );

    let recipientProfile: any = null;
    if (isUserJobSeeker) {
      const profile = await RecruiterProfile.findOne({
        userId: targetUserId,
      })
        .populate("companyId", "name logo")
        .lean();
      if (profile) {
        recipientProfile = {
          name: `${profile.firstName} ${profile.lastName}`,
          firstName: profile.firstName,
          lastName: profile.lastName,
          profilePicture: profile.profilePicture || "",
          headline: profile.headline || profile.designation || "Recruiter",
          companyName:
            (profile.companyId as any)?.name || profile.currentCompany || "",
        };
      }
    } else {
      const profile = await JobSeekerProfile.findOne({
        userId: targetUserId,
      }).lean();
      if (profile) {
        recipientProfile = {
          name: `${profile.firstName} ${profile.lastName}`,
          firstName: profile.firstName,
          lastName: profile.lastName,
          profilePicture: profile.profilePicture || "",
          headline: profile.headline || "Job Applicant",
        };
      }
    }

    if (!recipientProfile) {
      recipientProfile = {
        name: targetUser?.email ? targetUser.email.split("@")[0] : "User",
        firstName: "User",
        lastName: "",
        profilePicture: "",
        headline: "",
      };
    }

    const unreadCount = isUserJobSeeker
      ? conv.unreadCounts?.jobSeeker || 0
      : conv.unreadCounts?.recruiter || 0;

    return {
      ...conv,
      id: conv._id.toString(),
      recipient: {
        userId: targetUserId,
        email: targetUser?.email || "",
        role: targetUser?.role || "",
        ...recipientProfile,
      },
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
      participants: userId,
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

    // Reverse so chronologically ascending for chat window display
    const chronologicalMessages = messages.reverse().map((msg) => ({
      ...msg,
      id: msg._id.toString(),
    }));

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
      participants: userId,
    });

    if (!conversation) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.CONVERSATION_NOT_FOUND
      );
    }

    const receiverId = conversation.participants
      .find((p) => p.toString() !== userId)
      ?.toString();

    if (!receiverId) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        CHAT_MESSAGES.INVALID_PARTICIPANTS
      );
    }

    const message = await Message.create({
      conversationId: new Types.ObjectId(conversationId),
      sender: new Types.ObjectId(userId),
      receiver: new Types.ObjectId(receiverId),
      message: data.message.trim(),
      messageType: data.messageType || "text",
      attachments: data.attachments || [],
      replyTo: data.replyTo ? new Types.ObjectId(data.replyTo) : null,
      read: false,
      delivered: false,
    });

    // Update conversation last message & increment target unread count
    const isSenderJobSeeker = conversation.jobSeeker.toString() === userId;
    const unreadKey = isSenderJobSeeker
      ? "unreadCounts.recruiter"
      : "unreadCounts.jobSeeker";

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastMessageAt: message.createdAt,
      $inc: { [unreadKey]: 1 },
    });

    const populatedMessage = await Message.findById(message._id)
      .populate("replyTo", "message sender isDeleted")
      .lean();

    return {
      ...populatedMessage,
      id: message._id.toString(),
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
      participants: userId,
    });

    if (!conversation) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        CHAT_MESSAGES.CONVERSATION_NOT_FOUND
      );
    }

    const isUserJobSeeker = conversation.jobSeeker.toString() === userId;
    const unreadKey = isUserJobSeeker
      ? "unreadCounts.jobSeeker"
      : "unreadCounts.recruiter";

    await Message.updateMany(
      {
        conversationId,
        receiver: userId,
        read: false,
      },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      }
    );

    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { [unreadKey]: 0 },
    });

    return { conversationId, success: true };
  }

  /**
   * Get total unread count for user across all conversations
   */
  static async getUnreadCount(userId: string, userRole: Role) {
    if (userRole === Role.ADMIN) return { unreadCount: 0 };

    const conversations = await Conversation.find({
      participants: userId,
    }).lean();

    const totalUnread = conversations.reduce((acc, conv) => {
      const isJobSeeker = conv.jobSeeker.toString() === userId;
      const count = isJobSeeker
        ? conv.unreadCounts?.jobSeeker || 0
        : conv.unreadCounts?.recruiter || 0;
      return acc + count;
    }, 0);

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
      participants: userId,
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
}
