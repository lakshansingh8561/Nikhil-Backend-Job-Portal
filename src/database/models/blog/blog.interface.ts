import { Document, Types } from "mongoose";
import { Role } from "../../../common/enums/role.enum";

export interface ICoverImage {
  url: string;
  publicId: string;
}

export interface IBlog extends Document {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: ICoverImage;
  category: string;
  tags: string[];
  author: Types.ObjectId;
  authorRole: Role;
  status: "draft" | "published";
  views: number;
  uniqueViews: number;
  commentsCount: number;
  readTime: number;
  publishedAt: Date | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
