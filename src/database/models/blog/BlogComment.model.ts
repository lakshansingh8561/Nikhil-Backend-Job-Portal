import { Schema, model } from "mongoose";
import { IBlogComment } from "./blogComment.interface";

const blogCommentSchema = new Schema<IBlogComment>(
  {
    blog: { type: Schema.Types.ObjectId, ref: "Blog", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    avatar: { type: String, default: "" },
    content: { type: String, required: true, trim: true },
    isApproved: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

blogCommentSchema.index({ blog: 1, isApproved: 1, createdAt: 1 });

export const BlogComment = model<IBlogComment>("BlogComment", blogCommentSchema);
