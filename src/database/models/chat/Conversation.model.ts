import { Schema, model } from "mongoose";
import { IConversation } from "./chat.interface";

const conversationSchema = new Schema<IConversation>(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    recruiter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    jobSeeker: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    unreadCounts: {
      jobSeeker: {
        type: Number,
        default: 0,
        min: 0,
      },
      recruiter: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Performance & uniqueness indexes
conversationSchema.index(
  { recruiter: 1, jobSeeker: 1, jobId: 1 },
  { unique: true }
);
conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });

export const Conversation = model<IConversation>(
  "Conversation",
  conversationSchema
);
