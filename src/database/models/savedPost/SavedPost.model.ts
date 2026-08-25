import { Schema, model } from "mongoose";
import { ISavedPost } from "./savedPost.interface";

const savedPostSchema = new Schema<ISavedPost>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

savedPostSchema.index({ userId: 1, postId: 1 }, { unique: true });
savedPostSchema.index({ userId: 1, createdAt: -1 });

export const SavedPost = model<ISavedPost>("SavedPost", savedPostSchema);
