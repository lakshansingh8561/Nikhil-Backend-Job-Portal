import { z } from "zod";
import { ReactionType } from "../../common/enums/reactionType.enum";
import { MediaType, PostVisibility } from "../../common/enums/postVisibility.enum";

const mediaItem = z.object({
  url: z.string().min(1, "Media url is required"),
  type: z.nativeEnum(MediaType).optional(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  bytes: z.coerce.number().optional(),
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
  publicId: z.string().optional(),
});

/**
 * `content` is optional here on purpose — a post with only attachments is
 * valid. The "text or media" requirement is enforced in the service, which is
 * the only place that can see both fields together after normalisation.
 */
const createPost = z.object({
  content: z.string().max(3000, "Posts are limited to 3000 characters").optional().default(""),
  media: z.array(mediaItem).max(10, "You can attach up to 10 files").optional().default([]),
  mediaUrls: z.array(z.string()).optional(),
  postType: z.enum(["GENERAL", "HIRING", "WORK_UPDATE"]).optional(),
  visibility: z.nativeEnum(PostVisibility).optional(),
  jobId: z.string().optional(),
});

const updatePost = z.object({
  content: z.string().max(3000).optional(),
  media: z.array(mediaItem).max(10).optional(),
  visibility: z.nativeEnum(PostVisibility).optional(),
});

/** `null` clears the viewer's reaction, which is how un-reacting is expressed. */
const reactToPost = z.object({
  type: z.nativeEnum(ReactionType).nullable().optional().default(ReactionType.LIKE),
});

const repost = z.object({
  content: z.string().max(3000).optional().default(""),
});

const addComment = z.object({
  content: z.string().min(1, "Comment cannot be empty").max(1500, "Comments are limited to 1500 characters"),
  parentCommentId: z.string().optional().nullable(),
});

const updateComment = z.object({
  content: z.string().min(1, "Comment cannot be empty").max(1500),
});

export const PostValidation = {
  createPost,
  updatePost,
  reactToPost,
  repost,
  addComment,
  updateComment,
};
