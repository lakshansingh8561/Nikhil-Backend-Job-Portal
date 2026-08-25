import { Types } from "mongoose";
import {
  Post,
  Comment,
  Job,
  Connection,
  Follow,
  SavedPost,
} from "../../database/models";
import { Role } from "../../common/enums/role.enum";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { ReactionType } from "../../common/enums/reactionType.enum";
import { ConnectionStatus } from "../../common/enums/connectionStatus.enum";
import { MediaType, PostVisibility } from "../../common/enums/postVisibility.enum";
import { NotificationService } from "../notifications/notification.service";
import { emitToUser, emitToUsers, emitBroadcast } from "../../common/utils/emitToUser";
import { AuthorDTO, hydrateAuthors, unknownAuthor } from "../network/author.lookup";
import { extractHashtags, resolveMentions } from "./posts.mentions";
import {
  CreatePostPayload,
  FeedTab,
  PostMediaInput,
  SocialProof,
  UpdatePostPayload,
  asObjectId,
} from "./posts.types";

const REACTION_VALUES = Object.values(ReactionType);

export class PostsService {
  // ---------------------------------------------------------------------------
  // Shaping helpers
  // ---------------------------------------------------------------------------

  /** Infer a media type from the mime type / file extension when absent. */
  private static normalizeMedia(input: PostMediaInput[] = []): PostMediaInput[] {
    return input
      .filter((item) => item && typeof item.url === "string" && item.url.trim().length > 0)
      .slice(0, 10)
      .map((item) => ({
        url: item.url.trim(),
        type: item.type || PostsService.inferMediaType(item),
        mimeType: item.mimeType || "",
        fileName: item.fileName || "",
        bytes: item.bytes || 0,
        width: item.width || 0,
        height: item.height || 0,
        publicId: item.publicId || "",
      }));
  }

  private static inferMediaType(item: PostMediaInput): MediaType {
    const mime = item.mimeType || "";
    if (mime.startsWith("image/")) return MediaType.IMAGE;
    if (mime.startsWith("video/")) return MediaType.VIDEO;
    if (mime) return MediaType.DOCUMENT;

    const ext = (item.url.split("?")[0].split(".").pop() || "").toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"].includes(ext)) {
      return MediaType.IMAGE;
    }
    if (["mp4", "webm", "mov", "m4v", "avi", "mkv"].includes(ext)) {
      return MediaType.VIDEO;
    }
    return MediaType.DOCUMENT;
  }

  /** Collapse a reaction array into counts per type plus the dominant types. */
  private static buildSocialProof(reactions: any[] = []): SocialProof {
    const counts = new Map<ReactionType, number>();
    for (const reaction of reactions) {
      const type = (reaction?.type as ReactionType) || ReactionType.LIKE;
      counts.set(type, (counts.get(type) || 0) + 1);
    }

    const breakdown = Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total: reactions.length,
      breakdown,
      topTypes: breakdown.slice(0, 3).map((entry) => entry.type),
    };
  }

  /**
   * Turn raw post documents into the feed DTO the client renders.
   *
   * Authors, job cards, reposted originals and saved-state are all resolved in
   * batch — the previous implementation issued four author queries *per post*,
   * so a 10-post page cost roughly 40 round trips.
   */
  private static async shapePosts(posts: any[], currentUserId?: string) {
    if (posts.length === 0) return [];

    const repostIds = posts.map((p) => p.repostOf).filter(Boolean);
    const originals = repostIds.length
      ? await Post.find({ _id: { $in: repostIds } }).lean()
      : [];
    const originalMap = new Map(originals.map((p) => [p._id.toString(), p]));

    const jobIds = [...posts, ...originals].map((p) => p.jobId).filter(Boolean);
    const jobs = jobIds.length
      ? await Job.find({ _id: { $in: jobIds } })
          .select("title company location jobType salaryRange")
          .lean()
      : [];
    const jobMap = new Map(jobs.map((j) => [j._id.toString(), j]));

    const authorIds = [...posts, ...originals].map((p) => p.userId);
    const authorMap = await hydrateAuthors(authorIds);

    let savedIds = new Set<string>();
    if (currentUserId) {
      const saved = await SavedPost.find({
        userId: asObjectId(currentUserId),
        postId: { $in: posts.map((p) => p._id) },
      })
        .select("postId")
        .lean();
      savedIds = new Set(saved.map((s) => s.postId.toString()));
    }

    const resolveAuthor = (userId: Types.ObjectId): AuthorDTO =>
      authorMap.get(userId.toString()) || unknownAuthor(userId.toString());

    return posts.map((post) => {
      const reactions = post.reactions || [];
      const legacyLikes = post.likes || [];

      // Older documents only have `likes`; synthesise LIKE reactions for them so
      // counts and "did I react" stay correct without a migration.
      const effectiveReactions =
        reactions.length > 0
          ? reactions
          : legacyLikes.map((id: Types.ObjectId) => ({
              userId: id,
              type: ReactionType.LIKE,
              createdAt: post.createdAt,
            }));

      const mine = currentUserId
        ? effectiveReactions.find((r: any) => r.userId?.toString() === currentUserId)
        : undefined;

      const original = post.repostOf ? originalMap.get(post.repostOf.toString()) : null;

      return {
        ...post,
        _id: post._id.toString(),
        author: resolveAuthor(post.userId),
        media: post.media?.length
          ? post.media
          : (post.mediaUrls || []).map((url: string) => ({
              url,
              type: PostsService.inferMediaType({ url }),
            })),
        jobDetails: post.jobId ? jobMap.get(post.jobId.toString()) || null : null,
        reactionsCount: effectiveReactions.length,
        socialProof: PostsService.buildSocialProof(effectiveReactions),
        myReaction: (mine?.type as ReactionType) || null,
        // Legacy flags the old UI still reads.
        likesCount: effectiveReactions.length,
        isLikedByMe: Boolean(mine),
        isSavedByMe: savedIds.has(post._id.toString()),
        isMine: currentUserId ? post.userId.toString() === currentUserId : false,
        repostOfPost: original
          ? {
              ...original,
              _id: original._id.toString(),
              author: resolveAuthor(original.userId),
              media: original.media?.length
                ? original.media
                : (original.mediaUrls || []).map((url: string) => ({
                    url,
                    type: PostsService.inferMediaType({ url }),
                  })),
              jobDetails: original.jobId ? jobMap.get(original.jobId.toString()) || null : null,
            }
          : null,
      };
    });
  }

  private static async shapeSinglePost(post: any, currentUserId?: string) {
    const [shaped] = await PostsService.shapePosts([post], currentUserId);
    return shaped;
  }

  /** Ids the viewer follows or is connected to — the "Following" feed scope. */
  private static async getNetworkUserIds(userId: string): Promise<Types.ObjectId[]> {
    const me = asObjectId(userId);

    const [connections, follows] = await Promise.all([
      Connection.find({
        status: ConnectionStatus.ACCEPTED,
        $or: [{ requesterId: me }, { recipientId: me }],
      })
        .select("requesterId recipientId")
        .lean(),
      Follow.find({ followerId: me }).select("followingId").lean(),
    ]);

    const ids = new Set<string>();
    for (const c of connections) {
      ids.add(c.requesterId.toString() === userId ? c.recipientId.toString() : c.requesterId.toString());
    }
    for (const f of follows) {
      ids.add(f.followingId.toString());
    }

    return Array.from(ids).map((id) => new Types.ObjectId(id));
  }

  /**
   * Feed visibility: a CONNECTIONS-only post is readable by its author and by
   * accepted connections, never by the wider directory.
   */
  private static async buildVisibilityFilter(currentUserId?: string) {
    if (!currentUserId) {
      return { visibility: { $ne: PostVisibility.CONNECTIONS } };
    }

    const me = asObjectId(currentUserId);
    const connections = await Connection.find({
      status: ConnectionStatus.ACCEPTED,
      $or: [{ requesterId: me }, { recipientId: me }],
    })
      .select("requesterId recipientId")
      .lean();

    const connectedIds = connections.map((c) =>
      c.requesterId.toString() === currentUserId ? c.recipientId : c.requesterId
    );

    return {
      $or: [
        { visibility: { $ne: PostVisibility.CONNECTIONS } },
        { userId: me },
        { userId: { $in: connectedIds } },
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Posts
  // ---------------------------------------------------------------------------

  /**
   * Create a post.
   *
   * Content is optional whenever there is at least one attachment — the old
   * unconditional "content cannot be empty" guard is what made caption-less
   * image posts impossible.
   */
  static async createPost(userId: string, userRole: Role, payload: CreatePostPayload) {
    const content = (payload.content || "").trim();
    const media = PostsService.normalizeMedia(
      payload.media?.length
        ? payload.media
        : (payload.mediaUrls || []).map((url) => ({ url }))
    );

    if (content.length === 0 && media.length === 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Add some text or an attachment before posting.");
    }
    if (content.length > 3000) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Posts are limited to 3000 characters.");
    }

    let validJobId: Types.ObjectId | null = null;
    if (payload.jobId && payload.jobId.trim().length > 0) {
      const job = await Job.findById(payload.jobId);
      if (job) validJobId = job._id as Types.ObjectId;
    }

    const mentions = await resolveMentions(content);

    const newPost = await Post.create({
      userId: asObjectId(userId),
      authorRole: userRole,
      content,
      media,
      mediaUrls: media.map((m) => m.url),
      postType: payload.postType || (validJobId ? "HIRING" : "GENERAL"),
      visibility: payload.visibility || PostVisibility.ANYONE,
      jobId: validJobId,
      reactions: [],
      likes: [],
      reactionsCount: 0,
      commentsCount: 0,
      repostCount: 0,
      hashtags: extractHashtags(content),
      mentions,
      isDeleted: false,
    });

    const shaped = await PostsService.shapeSinglePost(newPost.toObject(), userId);

    emitBroadcast("feed:new-post", { post: shaped });
    await PostsService.notifyMentions(mentions, userId, newPost._id.toString(), "post");

    return shaped;
  }

  /** Feed with LinkedIn's two scopes: everything, or just your network. */
  static async getFeed(
    currentUserId: string,
    tab: FeedTab = "for-you",
    page: number = 1,
    limit: number = 10
  ) {
    const skip = (page - 1) * limit;
    const visibilityFilter = await PostsService.buildVisibilityFilter(currentUserId);

    const filter: any = { isDeleted: { $ne: true }, ...visibilityFilter };

    if (tab === "following") {
      const networkIds = await PostsService.getNetworkUserIds(currentUserId);
      // Include the viewer's own posts so a brand-new account isn't empty.
      filter.userId = { $in: [...networkIds, asObjectId(currentUserId)] };
    }

    const [posts, total] = await Promise.all([
      Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Post.countDocuments(filter),
    ]);

    return {
      posts: await PostsService.shapePosts(posts, currentUserId),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Backwards-compatible alias for the original feed method name. */
  static async getCommunityFeed(page: number = 1, limit: number = 10, currentUserId?: string) {
    return PostsService.getFeed(currentUserId || "", "for-you", page, limit);
  }

  /** Single post for the permalink page. */
  static async getPostById(postId: string, currentUserId?: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid post id.");
    }

    const post = await Post.findOne({ _id: asObjectId(postId), isDeleted: { $ne: true } }).lean();
    if (!post) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "This post is no longer available.");
    }

    return PostsService.shapeSinglePost(post, currentUserId);
  }

  static async getUserPosts(
    targetUserId: string,
    page: number = 1,
    limit: number = 10,
    currentUserId?: string
  ) {
    const skip = (page - 1) * limit;
    const filter = { userId: asObjectId(targetUserId), isDeleted: { $ne: true } };

    const [posts, total] = await Promise.all([
      Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Post.countDocuments(filter),
    ]);

    return {
      posts: await PostsService.shapePosts(posts, currentUserId),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  static async updatePost(userId: string, postId: string, payload: UpdatePostPayload) {
    const post = await Post.findOne({ _id: asObjectId(postId), isDeleted: { $ne: true } });
    if (!post) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Post not found.");
    if (post.userId.toString() !== userId) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You can only edit your own posts.");
    }

    if (payload.content !== undefined) {
      const content = payload.content.trim();
      const keptMedia = payload.media !== undefined ? payload.media : post.media;
      if (content.length === 0 && (!keptMedia || keptMedia.length === 0)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, "A post needs either text or an attachment.");
      }
      post.content = content;
      post.hashtags = extractHashtags(content);
      post.mentions = await resolveMentions(content);
    }

    if (payload.media !== undefined) {
      const media = PostsService.normalizeMedia(payload.media);
      post.media = media as any;
      post.mediaUrls = media.map((m) => m.url);
    }

    if (payload.visibility) {
      post.visibility = payload.visibility;
    }

    post.editedAt = new Date();
    await post.save();

    return PostsService.shapeSinglePost(post.toObject(), userId);
  }

  static async deletePost(userId: string, userRole: string, postId: string) {
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Post not found.");
    }

    if (post.userId.toString() !== userId && userRole !== Role.ADMIN) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You do not have permission to delete this post.");
    }

    post.isDeleted = true;
    post.deletedAt = new Date();
    await post.save();

    // Keep the original's repost tally honest when a repost is removed.
    if (post.repostOf) {
      await Post.updateOne({ _id: post.repostOf }, { $inc: { repostCount: -1 } });
    }

    emitBroadcast("feed:post-deleted", { postId: post._id.toString() });

    return { message: "Post deleted successfully.", postId: post._id.toString() };
  }

  // ---------------------------------------------------------------------------
  // Reactions
  // ---------------------------------------------------------------------------

  /**
   * Add, switch, or remove a reaction.
   *
   * Sending the type you already have toggles it off, which is how LinkedIn's
   * Like button behaves; sending a different type switches in place.
   */
  static async reactToPost(userId: string, postId: string, type: ReactionType | null) {
    if (type && !REACTION_VALUES.includes(type)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Unknown reaction type.");
    }

    const post = await Post.findOne({ _id: asObjectId(postId), isDeleted: { $ne: true } });
    if (!post) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Post not found.");

    const me = asObjectId(userId);

    // Backfill legacy `likes` into `reactions` on first touch.
    if ((!post.reactions || post.reactions.length === 0) && post.likes?.length) {
      post.reactions = post.likes.map((id) => ({
        userId: id,
        type: ReactionType.LIKE,
        createdAt: post.createdAt,
      })) as any;
    }

    const existingIndex = post.reactions.findIndex((r) => r.userId.toString() === userId);
    const existing = existingIndex >= 0 ? post.reactions[existingIndex] : null;

    let myReaction: ReactionType | null = null;

    if (type === null || (existing && existing.type === type)) {
      if (existingIndex >= 0) post.reactions.splice(existingIndex, 1);
    } else if (existing) {
      existing.type = type;
      existing.createdAt = new Date();
      myReaction = type;
    } else {
      post.reactions.push({ userId: me, type, createdAt: new Date() } as any);
      myReaction = type;
    }

    // Mirror into the legacy field so the admin panel and old clients still work.
    post.likes = post.reactions.map((r) => r.userId);
    post.reactionsCount = post.reactions.length;
    await post.save();

    const socialProof = PostsService.buildSocialProof(post.reactions);
    const payload = {
      postId: post._id.toString(),
      reactionsCount: post.reactions.length,
      likesCount: post.reactions.length,
      socialProof,
      myReaction,
      isLikedByMe: Boolean(myReaction),
    };

    emitBroadcast("post:reaction", { ...payload, myReaction: undefined });

    // Only notify on a fresh reaction, and never on your own post.
    if (myReaction && !existing && post.userId.toString() !== userId) {
      const actor = await PostsService.describeActor(userId);
      await NotificationService.createNotification({
        recipientId: post.userId.toString(),
        senderId: userId,
        type: "POST_REACTION",
        title: "New reaction on your post",
        message: `${actor} reacted to your post.`,
        link: `/network/post/${post._id.toString()}`,
      });
      emitToUser(post.userId.toString(), "notification:new", { type: "POST_REACTION" });
    }

    return payload;
  }

  /** Legacy binary like — now a thin wrapper over the reaction system. */
  static async toggleLikePost(userId: string, postId: string) {
    const post = await Post.findOne({ _id: asObjectId(postId), isDeleted: { $ne: true } })
      .select("reactions likes")
      .lean();
    const alreadyLiked =
      post?.reactions?.some((r: any) => r.userId.toString() === userId) ||
      post?.likes?.some((id: any) => id.toString() === userId);

    return PostsService.reactToPost(userId, postId, alreadyLiked ? null : ReactionType.LIKE);
  }

  /** Reactor list for the "who reacted" modal, optionally filtered by type. */
  static async getPostReactions(postId: string, type?: ReactionType, page = 1, limit = 20) {
    const post = await Post.findOne({ _id: asObjectId(postId), isDeleted: { $ne: true } })
      .select("reactions likes createdAt")
      .lean();
    if (!post) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Post not found.");

    const all =
      post.reactions?.length
        ? post.reactions
        : (post.likes || []).map((id: any) => ({
            userId: id,
            type: ReactionType.LIKE,
            createdAt: post.createdAt,
          }));

    const filtered = type ? all.filter((r: any) => r.type === type) : all;
    const sorted = [...filtered].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const skip = (page - 1) * limit;
    const pageSlice = sorted.slice(skip, skip + limit);
    const authorMap = await hydrateAuthors(pageSlice.map((r: any) => r.userId));

    return {
      reactions: pageSlice.map((r: any) => ({
        type: r.type,
        createdAt: r.createdAt,
        user: authorMap.get(r.userId.toString()) || unknownAuthor(r.userId.toString()),
      })),
      socialProof: PostsService.buildSocialProof(all),
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Reposts & saves
  // ---------------------------------------------------------------------------

  static async repost(userId: string, userRole: Role, postId: string, content?: string) {
    const original = await Post.findOne({ _id: asObjectId(postId), isDeleted: { $ne: true } });
    if (!original) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Post not found.");

    // Reposting a repost attributes to the true original, like LinkedIn does.
    const rootId = original.repostOf || original._id;
    const thoughts = (content || "").trim();
    const mentions = await resolveMentions(thoughts);

    const repost = await Post.create({
      userId: asObjectId(userId),
      authorRole: userRole,
      content: thoughts,
      media: [],
      mediaUrls: [],
      postType: "GENERAL",
      visibility: PostVisibility.ANYONE,
      repostOf: rootId,
      reactions: [],
      likes: [],
      reactionsCount: 0,
      commentsCount: 0,
      repostCount: 0,
      hashtags: extractHashtags(thoughts),
      mentions,
      isDeleted: false,
    });

    await Post.updateOne({ _id: rootId }, { $inc: { repostCount: 1 } });

    const shaped = await PostsService.shapeSinglePost(repost.toObject(), userId);
    emitBroadcast("feed:new-post", { post: shaped });

    const rootAuthor = await Post.findById(rootId).select("userId").lean();
    if (rootAuthor && rootAuthor.userId.toString() !== userId) {
      const actor = await PostsService.describeActor(userId);
      await NotificationService.createNotification({
        recipientId: rootAuthor.userId.toString(),
        senderId: userId,
        type: "POST_REPOST",
        title: "Your post was reposted",
        message: `${actor} reposted your post.`,
        link: `/network/post/${repost._id.toString()}`,
      });
      emitToUser(rootAuthor.userId.toString(), "notification:new", { type: "POST_REPOST" });
    }

    return shaped;
  }

  static async toggleSavePost(userId: string, postId: string) {
    const post = await Post.findOne({ _id: asObjectId(postId), isDeleted: { $ne: true } })
      .select("_id")
      .lean();
    if (!post) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Post not found.");

    const filter = { userId: asObjectId(userId), postId: asObjectId(postId) };
    const existing = await SavedPost.findOne(filter);

    if (existing) {
      await SavedPost.deleteOne({ _id: existing._id });
      return { postId, isSavedByMe: false, message: "Post removed from saved items." };
    }

    await SavedPost.create(filter);
    return { postId, isSavedByMe: true, message: "Post saved." };
  }

  static async getSavedPosts(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [saved, total] = await Promise.all([
      SavedPost.find({ userId: asObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SavedPost.countDocuments({ userId: asObjectId(userId) }),
    ]);

    const posts = await Post.find({
      _id: { $in: saved.map((s) => s.postId) },
      isDeleted: { $ne: true },
    }).lean();

    // Preserve save order rather than post creation order.
    const byId = new Map(posts.map((p) => [p._id.toString(), p]));
    const ordered = saved.map((s) => byId.get(s.postId.toString())).filter(Boolean);

    return {
      posts: await PostsService.shapePosts(ordered, userId),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---------------------------------------------------------------------------
  // Comments & replies
  // ---------------------------------------------------------------------------

  static async addComment(
    userId: string,
    postId: string,
    content: string,
    parentCommentId?: string
  ) {
    const trimmed = (content || "").trim();
    if (trimmed.length === 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Comment cannot be empty.");
    }
    if (trimmed.length > 1500) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Comments are limited to 1500 characters.");
    }

    const post = await Post.findOne({ _id: asObjectId(postId), isDeleted: { $ne: true } });
    if (!post) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Post not found.");

    let parent: any = null;
    if (parentCommentId) {
      parent = await Comment.findOne({
        _id: asObjectId(parentCommentId),
        postId: post._id,
        isDeleted: { $ne: true },
      });
      if (!parent) throw new ApiError(HTTP_STATUS.NOT_FOUND, "The comment you replied to is gone.");
      // Only two levels, like LinkedIn: a reply to a reply attaches to its parent.
      if (parent.parentCommentId) {
        parent = await Comment.findById(parent.parentCommentId);
      }
    }

    const mentions = await resolveMentions(trimmed);

    const comment = await Comment.create({
      postId: post._id,
      userId: asObjectId(userId),
      content: trimmed,
      parentCommentId: parent?._id || null,
      reactions: [],
      likes: [],
      reactionsCount: 0,
      repliesCount: 0,
      mentions,
      isDeleted: false,
    });

    // Only top-level comments count toward the post's comment total, matching
    // how the count is displayed ("N comments" excludes nested replies).
    if (parent) {
      await Comment.updateOne({ _id: parent._id }, { $inc: { repliesCount: 1 } });
    } else {
      post.commentsCount = (post.commentsCount || 0) + 1;
      await post.save();
    }

    const shaped = await PostsService.shapeComments([comment.toObject()], userId);
    const result = shaped[0];

    emitBroadcast("post:comment", {
      postId: post._id.toString(),
      comment: result,
      commentsCount: post.commentsCount,
    });

    const actor = await PostsService.describeActor(userId);
    const recipients = new Set<string>();
    if (post.userId.toString() !== userId) recipients.add(post.userId.toString());
    if (parent && parent.userId.toString() !== userId) recipients.add(parent.userId.toString());

    for (const recipientId of recipients) {
      const isReply = parent && recipientId === parent.userId.toString();
      await NotificationService.createNotification({
        recipientId,
        senderId: userId,
        type: isReply ? "COMMENT_REPLY" : "POST_COMMENT",
        title: isReply ? "New reply to your comment" : "New comment on your post",
        message: isReply
          ? `${actor} replied to your comment.`
          : `${actor} commented on your post.`,
        link: `/network/post/${post._id.toString()}`,
      });
      emitToUser(recipientId, "notification:new", { type: "POST_COMMENT" });
    }

    await PostsService.notifyMentions(mentions, userId, post._id.toString(), "comment");

    return result;
  }

  /** Attach author cards and viewer-relative reaction state to comments. */
  private static async shapeComments(comments: any[], currentUserId?: string) {
    if (comments.length === 0) return [];

    const authorMap = await hydrateAuthors(comments.map((c) => c.userId));

    return comments.map((comment) => {
      const reactions = comment.reactions?.length
        ? comment.reactions
        : (comment.likes || []).map((id: any) => ({
            userId: id,
            type: ReactionType.LIKE,
            createdAt: comment.createdAt,
          }));

      const mine = currentUserId
        ? reactions.find((r: any) => r.userId?.toString() === currentUserId)
        : undefined;

      return {
        ...comment,
        _id: comment._id.toString(),
        postId: comment.postId.toString(),
        parentCommentId: comment.parentCommentId ? comment.parentCommentId.toString() : null,
        author:
          authorMap.get(comment.userId.toString()) || unknownAuthor(comment.userId.toString()),
        reactionsCount: reactions.length,
        socialProof: PostsService.buildSocialProof(reactions),
        myReaction: (mine?.type as ReactionType) || null,
        likesCount: reactions.length,
        isLikedByMe: Boolean(mine),
        isMine: currentUserId ? comment.userId.toString() === currentUserId : false,
        replies: [] as any[],
      };
    });
  }

  /**
   * Top-level comments plus the first two replies of each thread, so the
   * common case renders in one request.
   */
  static async getPostComments(
    postId: string,
    page: number = 1,
    limit: number = 10,
    currentUserId?: string,
    sort: "recent" | "relevant" = "relevant"
  ) {
    const skip = (page - 1) * limit;
    const filter = {
      postId: asObjectId(postId),
      parentCommentId: null,
      isDeleted: { $ne: true },
    };

    const sortSpec: any =
      sort === "recent"
        ? { createdAt: -1 }
        : { reactionsCount: -1, repliesCount: -1, createdAt: -1 };

    const [comments, total] = await Promise.all([
      Comment.find(filter).sort(sortSpec).skip(skip).limit(limit).lean(),
      Comment.countDocuments(filter),
    ]);

    const shaped = await PostsService.shapeComments(comments, currentUserId);

    const withReplies = comments.filter((c) => (c.repliesCount || 0) > 0);
    if (withReplies.length > 0) {
      // One query for all preview replies, then take the newest two per thread.
      const replies = await Comment.find({
        parentCommentId: { $in: withReplies.map((c) => c._id) },
        isDeleted: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .lean();

      const grouped = new Map<string, any[]>();
      for (const reply of replies) {
        const key = reply.parentCommentId!.toString();
        const bucket = grouped.get(key) || [];
        if (bucket.length < 2) {
          bucket.push(reply);
          grouped.set(key, bucket);
        }
      }

      const previewReplies = Array.from(grouped.values()).flat();
      const shapedReplies = await PostsService.shapeComments(previewReplies, currentUserId);
      const repliesByParent = new Map<string, any[]>();
      for (const reply of shapedReplies) {
        const key = reply.parentCommentId!;
        repliesByParent.set(key, [...(repliesByParent.get(key) || []), reply]);
      }

      for (const comment of shaped) {
        // Oldest-first inside the thread, matching how replies read.
        comment.replies = (repliesByParent.get(comment._id) || []).reverse();
      }
    }

    return {
      comments: shaped,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  static async getCommentReplies(
    commentId: string,
    page: number = 1,
    limit: number = 10,
    currentUserId?: string
  ) {
    const skip = (page - 1) * limit;
    const filter = { parentCommentId: asObjectId(commentId), isDeleted: { $ne: true } };

    const [replies, total] = await Promise.all([
      Comment.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
      Comment.countDocuments(filter),
    ]);

    return {
      replies: await PostsService.shapeComments(replies, currentUserId),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  static async reactToComment(userId: string, commentId: string, type: ReactionType | null) {
    if (type && !REACTION_VALUES.includes(type)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Unknown reaction type.");
    }

    const comment = await Comment.findOne({
      _id: asObjectId(commentId),
      isDeleted: { $ne: true },
    });
    if (!comment) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Comment not found.");

    if ((!comment.reactions || comment.reactions.length === 0) && comment.likes?.length) {
      comment.reactions = comment.likes.map((id) => ({
        userId: id,
        type: ReactionType.LIKE,
        createdAt: comment.createdAt,
      })) as any;
    }

    const existingIndex = comment.reactions.findIndex((r) => r.userId.toString() === userId);
    const existing = existingIndex >= 0 ? comment.reactions[existingIndex] : null;

    let myReaction: ReactionType | null = null;

    if (type === null || (existing && existing.type === type)) {
      if (existingIndex >= 0) comment.reactions.splice(existingIndex, 1);
    } else if (existing) {
      existing.type = type;
      existing.createdAt = new Date();
      myReaction = type;
    } else {
      comment.reactions.push({ userId: asObjectId(userId), type, createdAt: new Date() } as any);
      myReaction = type;
    }

    comment.likes = comment.reactions.map((r) => r.userId);
    comment.reactionsCount = comment.reactions.length;
    await comment.save();

    if (myReaction && !existing && comment.userId.toString() !== userId) {
      const actor = await PostsService.describeActor(userId);
      await NotificationService.createNotification({
        recipientId: comment.userId.toString(),
        senderId: userId,
        type: "COMMENT_REACTION",
        title: "New reaction on your comment",
        message: `${actor} reacted to your comment.`,
        link: `/network/post/${comment.postId.toString()}`,
      });
      emitToUser(comment.userId.toString(), "notification:new", { type: "COMMENT_REACTION" });
    }

    return {
      commentId: comment._id.toString(),
      postId: comment.postId.toString(),
      reactionsCount: comment.reactions.length,
      likesCount: comment.reactions.length,
      socialProof: PostsService.buildSocialProof(comment.reactions),
      myReaction,
      isLikedByMe: Boolean(myReaction),
    };
  }

  static async updateComment(userId: string, commentId: string, content: string) {
    const trimmed = (content || "").trim();
    if (trimmed.length === 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Comment cannot be empty.");
    }

    const comment = await Comment.findOne({
      _id: asObjectId(commentId),
      isDeleted: { $ne: true },
    });
    if (!comment) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Comment not found.");
    if (comment.userId.toString() !== userId) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You can only edit your own comments.");
    }

    comment.content = trimmed;
    comment.mentions = await resolveMentions(trimmed);
    comment.editedAt = new Date();
    await comment.save();

    const [shaped] = await PostsService.shapeComments([comment.toObject()], userId);
    return shaped;
  }

  static async deleteComment(userId: string, userRole: string, commentId: string) {
    const comment = await Comment.findById(commentId);
    if (!comment || comment.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Comment not found.");
    }

    const post = await Post.findById(comment.postId).select("userId commentsCount");
    const isOwner = comment.userId.toString() === userId;
    const isPostOwner = post?.userId.toString() === userId;

    if (!isOwner && !isPostOwner && userRole !== Role.ADMIN) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You cannot delete this comment.");
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    if (comment.parentCommentId) {
      await Comment.updateOne(
        { _id: comment.parentCommentId, repliesCount: { $gt: 0 } },
        { $inc: { repliesCount: -1 } }
      );
    } else {
      // Removing a thread head removes its replies from the count too.
      const replyIds = await Comment.find({
        parentCommentId: comment._id,
        isDeleted: { $ne: true },
      })
        .select("_id")
        .lean();

      if (replyIds.length > 0) {
        await Comment.updateMany(
          { _id: { $in: replyIds.map((r) => r._id) } },
          { $set: { isDeleted: true, deletedAt: new Date() } }
        );
      }

      await Post.updateOne(
        { _id: comment.postId, commentsCount: { $gt: 0 } },
        { $inc: { commentsCount: -1 } }
      );
    }

    return {
      message: "Comment deleted.",
      commentId: comment._id.toString(),
      postId: comment.postId.toString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Notification helpers
  // ---------------------------------------------------------------------------

  /** Display name used in notification copy. */
  private static async describeActor(userId: string): Promise<string> {
    const map = await hydrateAuthors([userId]);
    return map.get(userId)?.fullName || "Someone";
  }

  private static async notifyMentions(
    mentions: Types.ObjectId[],
    actorId: string,
    postId: string,
    context: "post" | "comment"
  ) {
    const recipients = mentions.map((id) => id.toString()).filter((id) => id !== actorId);
    if (recipients.length === 0) return;

    const actor = await PostsService.describeActor(actorId);

    await Promise.all(
      recipients.map((recipientId) =>
        NotificationService.createNotification({
          recipientId,
          senderId: actorId,
          type: "MENTION",
          title: "You were mentioned",
          message: `${actor} mentioned you in a ${context}.`,
          link: `/network/post/${postId}`,
        })
      )
    );

    emitToUsers(recipients, "notification:new", { type: "MENTION" });
  }
}
