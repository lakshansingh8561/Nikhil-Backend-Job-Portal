import { Schema, model } from "mongoose";
import { IComment, ICommentReaction } from "./comment.interface";
import { ReactionType } from "../../../common/enums/reactionType.enum";

const commentReactionSchema = new Schema<ICommentReaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: Object.values(ReactionType),
      default: ReactionType.LIKE,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const commentSchema = new Schema<IComment>(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    parentCommentId: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },
    repliesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    reactions: {
      type: [commentReactionSchema],
      default: [],
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    reactionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    mentions: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    editedAt: {
      type: Date,
      default: null,
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

// Compound indexes for fast retrieval of comments and their reply threads
commentSchema.index({ postId: 1, isDeleted: 1, createdAt: 1 });
commentSchema.index({ postId: 1, parentCommentId: 1, createdAt: 1 });

export const Comment = model<IComment>("Comment", commentSchema);
