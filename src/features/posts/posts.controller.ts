import { Request, Response } from "express";
import { PostsService } from "./posts.service";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums/role.enum";
import { ReactionType } from "../../common/enums/reactionType.enum";
import { FeedTab } from "./posts.types";

const getUserIdFromReq = (req: Request): string => {
  const user = (req as any).user;
  return String(user?.userId || user?.id || user?._id || "");
};

const getUserRoleFromReq = (req: Request): Role => {
  const user = (req as any).user;
  return user?.role as Role;
};

const parsePage = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class PostsController {
  // --- Posts -----------------------------------------------------------------

  static createPost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.createPost(
      getUserIdFromReq(req),
      getUserRoleFromReq(req),
      req.body
    );

    res
      .status(HTTP_STATUS.CREATED)
      .json(new ApiResponse(true, "Post published successfully 🎉", result));
  });

  static getFeed = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tab: FeedTab = req.query.tab === "following" ? "following" : "for-you";

    const result = await PostsService.getFeed(
      getUserIdFromReq(req),
      tab,
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 10)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Feed fetched successfully.", result));
  });

  static getSavedPosts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.getSavedPosts(
      getUserIdFromReq(req),
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 10)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Saved posts fetched.", result));
  });

  static getUserPosts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.getUserPosts(
      req.params.userId as string,
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 10),
      getUserIdFromReq(req)
    );

    res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(true, "User posts fetched successfully.", result));
  });

  static getPostById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.getPostById(req.params.id as string, getUserIdFromReq(req));

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Post fetched successfully.", result));
  });

  static updatePost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.updatePost(
      getUserIdFromReq(req),
      req.params.id as string,
      req.body
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Post updated.", result));
  });

  static deletePost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.deletePost(
      getUserIdFromReq(req),
      getUserRoleFromReq(req),
      req.params.id as string
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, result.message, result));
  });

  // --- Reactions -------------------------------------------------------------

  static reactToPost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.reactToPost(
      getUserIdFromReq(req),
      req.params.id as string,
      (req.body?.type ?? null) as ReactionType | null
    );

    res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(true, result.myReaction ? "Reaction saved." : "Reaction removed.", result));
  });

  /** Kept so older clients calling POST /:id/like keep working. */
  static toggleLike = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.toggleLikePost(
      getUserIdFromReq(req),
      req.params.id as string
    );

    res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(true, result.isLikedByMe ? "Post liked" : "Post unliked", result));
  });

  static getPostReactions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const type = req.query.type as ReactionType | undefined;

    const result = await PostsService.getPostReactions(
      req.params.id as string,
      type,
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 20)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Reactions fetched.", result));
  });

  // --- Reposts & saves -------------------------------------------------------

  static repost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.repost(
      getUserIdFromReq(req),
      getUserRoleFromReq(req),
      req.params.id as string,
      req.body?.content
    );

    res.status(HTTP_STATUS.CREATED).json(new ApiResponse(true, "Reposted successfully.", result));
  });

  static toggleSave = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.toggleSavePost(
      getUserIdFromReq(req),
      req.params.id as string
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, result.message, result));
  });

  // --- Comments --------------------------------------------------------------

  static addComment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.addComment(
      getUserIdFromReq(req),
      req.params.id as string,
      req.body?.content,
      req.body?.parentCommentId || undefined
    );

    res
      .status(HTTP_STATUS.CREATED)
      .json(new ApiResponse(true, "Comment added successfully.", result));
  });

  static getComments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const sort = req.query.sort === "recent" ? "recent" : "relevant";

    const result = await PostsService.getPostComments(
      req.params.id as string,
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 10),
      getUserIdFromReq(req),
      sort
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Comments fetched successfully.", result));
  });

  static getCommentReplies = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.getCommentReplies(
      req.params.commentId as string,
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 10),
      getUserIdFromReq(req)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Replies fetched successfully.", result));
  });

  static reactToComment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.reactToComment(
      getUserIdFromReq(req),
      req.params.commentId as string,
      (req.body?.type ?? null) as ReactionType | null
    );

    res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(true, result.myReaction ? "Reaction saved." : "Reaction removed.", result));
  });

  static updateComment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.updateComment(
      getUserIdFromReq(req),
      req.params.commentId as string,
      req.body?.content
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Comment updated.", result));
  });

  static deleteComment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await PostsService.deleteComment(
      getUserIdFromReq(req),
      getUserRoleFromReq(req),
      req.params.commentId as string
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, result.message, result));
  });
}
