import { Schema, model } from "mongoose";
import { IBlogView } from "./blogView.interface";

const blogViewSchema = new Schema<IBlogView>(
  {
    blog: { type: Schema.Types.ObjectId, ref: "Blog", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    ipHash: { type: String, default: null, index: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

blogViewSchema.index({ blog: 1, user: 1 });
blogViewSchema.index({ blog: 1, ipHash: 1, createdAt: -1 });

export const BlogView = model<IBlogView>("BlogView", blogViewSchema);
