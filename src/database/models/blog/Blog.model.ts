import { Schema, model } from "mongoose";
import { IBlog } from "./blog.interface";
import { Role } from "../../../common/enums/role.enum";

const coverImageSchema = new Schema(
  {
    url: { type: String, required: true, default: "" },
    publicId: { type: String, default: "" },
  },
  { _id: false }
);

const blogSchema = new Schema<IBlog>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    excerpt: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    coverImage: { type: coverImageSchema, required: true },
    category: { type: String, required: true, trim: true, index: true },
    tags: { type: [String], default: [], index: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorRole: { type: String, enum: Object.values(Role), required: true, index: true },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    views: { type: Number, default: 0, min: 0 },
    uniqueViews: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    readTime: { type: Number, default: 1, min: 1 },
    publishedAt: { type: Date, default: null, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ category: 1, status: 1 });
blogSchema.index({ author: 1, isDeleted: 1 });
blogSchema.index({ isDeleted: 1, status: 1, publishedAt: -1 });
blogSchema.index({ title: "text", excerpt: "text", content: "text", tags: "text", category: "text" });

export const Blog = model<IBlog>("Blog", blogSchema);
