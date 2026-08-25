import { Schema, model } from "mongoose";
import { IPost, IPostMedia, IPostReaction } from "./post.interface";
import { Role } from "../../../common/enums/role.enum";
import { ReactionType } from "../../../common/enums/reactionType.enum";
import { MediaType, PostVisibility } from "../../../common/enums/postVisibility.enum";

const mediaSchema = new Schema<IPostMedia>(
  {
    url: { type: String, required: true },
    type: {
      type: String,
      enum: Object.values(MediaType),
      default: MediaType.IMAGE,
    },
    mimeType: { type: String, default: "" },
    fileName: { type: String, default: "" },
    bytes: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    publicId: { type: String, default: "" },
  },
  { _id: false }
);

const reactionSchema = new Schema<IPostReaction>(
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

const postSchema = new Schema<IPost>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authorRole: {
      type: String,
      enum: Object.values(Role),
      required: true,
      index: true,
    },
    // Not required: LinkedIn allows a media-only post with no caption.
    content: {
      type: String,
      default: "",
      trim: true,
    },
    media: {
      type: [mediaSchema],
      default: [],
    },
    // Legacy flat list, kept mirrored from `media` so older documents and the
    // admin panel keep rendering without a migration.
    mediaUrls: {
      type: [String],
      default: [],
    },
    postType: {
      type: String,
      enum: ["GENERAL", "HIRING", "WORK_UPDATE"],
      default: "GENERAL",
      index: true,
    },
    visibility: {
      type: String,
      enum: Object.values(PostVisibility),
      default: PostVisibility.ANYONE,
      index: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      default: null,
      index: true,
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    // Legacy like list, mirrored from `reactions`.
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
    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    repostOf: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      default: null,
      index: true,
    },
    repostCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    hashtags: {
      type: [String],
      default: [],
      index: true,
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

// Compound indexes for efficient feed retrieval sorted by creation time
postSchema.index({ isDeleted: 1, createdAt: -1 });
postSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
postSchema.index({ visibility: 1, isDeleted: 1, createdAt: -1 });

export const Post = model<IPost>("Post", postSchema);
