import { Document, Types } from "mongoose";
import { Role } from "../../../common/enums/role.enum";
import { ReactionType } from "../../../common/enums/reactionType.enum";
import { MediaType, PostVisibility } from "../../../common/enums/postVisibility.enum";

export type PostType = "GENERAL" | "HIRING" | "WORK_UPDATE";

/**
 * A single attachment on a post. `type` decides how the feed renders it:
 * IMAGE -> mosaic grid + lightbox, VIDEO -> inline player, DOCUMENT -> download card.
 * Intrinsic width/height let the client reserve space and avoid layout shift.
 */
export interface IPostMedia {
  url: string;
  type: MediaType;
  mimeType?: string;
  fileName?: string;
  bytes?: number;
  width?: number;
  height?: number;
  publicId?: string;
}

export interface IPostReaction {
  userId: Types.ObjectId;
  type: ReactionType;
  createdAt: Date;
}

export interface IPost extends Document {
  userId: Types.ObjectId;
  authorRole: Role;
  content: string;

  /** Structured attachments. Preferred over `mediaUrls`. */
  media: IPostMedia[];
  /** Legacy flat URL list, mirrored from `media` so older documents keep rendering. */
  mediaUrls?: string[];

  postType: PostType;
  visibility: PostVisibility;
  jobId?: Types.ObjectId | null;

  /** Typed reactions (LinkedIn's six). Preferred over `likes`. */
  reactions: IPostReaction[];
  /** Legacy like list, mirrored from `reactions` for backward compatibility. */
  likes: Types.ObjectId[];
  reactionsCount: number;
  commentsCount: number;

  /** Set when this post is a repost of another post. */
  repostOf?: Types.ObjectId | null;
  repostCount: number;

  hashtags: string[];
  mentions: Types.ObjectId[];

  editedAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
