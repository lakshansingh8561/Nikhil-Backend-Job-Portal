import { Schema, model } from "mongoose";
import { IConversation } from "./chat.interface";

const conversationMemberSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastReadMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ["DIRECT", "GROUP", "SYSTEM"],
      default: "DIRECT",
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    members: {
      type: [conversationMemberSchema],
      default: [],
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      index: true,
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    lastMessageAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.pre("save", function (next) {
  if (this.members && this.members.length > 0 && (!this.participants || this.participants.length === 0)) {
    this.participants = this.members.map((m: any) => m.userId);
  } else if (this.participants && this.participants.length > 0 && (!this.members || this.members.length === 0)) {
    this.members = this.participants.map((p: any) => ({ userId: p, joinedAt: new Date() }));
  }
  next();
});

conversationSchema.index({ participants: 1 });
conversationSchema.index({ "members.userId": 1 });
conversationSchema.index({ updatedAt: -1 });

export const Conversation = model<IConversation>(
  "Conversation",
  conversationSchema
);
