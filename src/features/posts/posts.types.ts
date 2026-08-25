import { Types } from "mongoose";
import { MediaType, PostVisibility } from "../../common/enums/postVisibility.enum";
import { ReactionType } from "../../common/enums/reactionType.enum";

/** Shape the composer sends for each attachment (already uploaded). */
export interface PostMediaInput {
  url: string;
  type?: MediaType;
  mimeType?: string;
  fileName?: string;
  bytes?: number;
  width?: number;
  height?: number;
  publicId?: string;
}

export interface CreatePostPayload {
  content?: string;
  media?: PostMediaInput[];
  /** Legacy field still accepted from older clients. */
  mediaUrls?: string[];
  postType?: "GENERAL" | "HIRING" | "WORK_UPDATE";
  visibility?: PostVisibility;
  jobId?: string;
}

export interface UpdatePostPayload {
  content?: string;
  media?: PostMediaInput[];
  visibility?: PostVisibility;
}

export type FeedTab = "for-you" | "following";

export interface ReactionSummary {
  type: ReactionType;
  count: number;
}

/** Author ids of the top few reactors, used for the overlapping-icons row. */
export interface SocialProof {
  total: number;
  breakdown: ReactionSummary[];
  topTypes: ReactionType[];
}

export const asObjectId = (value: Types.ObjectId | string): Types.ObjectId =>
  typeof value === "string" ? new Types.ObjectId(value) : value;
