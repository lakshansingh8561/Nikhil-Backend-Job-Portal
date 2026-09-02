import crypto from "crypto";
import { Blog, BlogView, BlogComment, User, UserProfile, JobSeekerProfile, RecruiterProfile } from "../../database/models";
import { Role } from "../../common/enums/role.enum";
import { CloudinaryService } from "../../common/services/cloudinary.service";
import { ApiError } from "../../common/utils/ApiError";
import { sanitizeHtml } from "../../common/utils/sanitizer";
import { BLOG_MESSAGES, AVERAGE_WORDS_PER_MINUTE, DEFAULT_BLOG_CATEGORIES } from "./blogs.constants";
import { ICreateBlogInput, IUpdateBlogInput, IBlogFilterQuery, IPaginatedBlogsResult } from "./blogs.types";
import { IBlog } from "../../database/models/blog/blog.interface";

export class BlogsService {
  /**
   * Helper: Generate a unique, URL-friendly slug from title
   */
  private static async generateUniqueSlug(title: string, currentBlogId?: string): Promise<string> {
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    let slug = baseSlug || "blog-post";
    let counter = 1;

    while (true) {
      const existing = await Blog.findOne({
        slug,
        isDeleted: false,
        ...(currentBlogId ? { _id: { $ne: currentBlogId } } : {}),
      });

      if (!existing) {
        break;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Helper: Calculate estimated read time in minutes
   */
  private static calculateReadTime(content: string): number {
    const plainText = content.replace(/<[^>]*>/g, " ");
    const words = plainText.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / AVERAGE_WORDS_PER_MINUTE));
  }

  /**
   * Helper: Enrich author profile info (name, profilePicture, role)
   */
  private static async populateAuthorDetails(blogDoc: IBlog): Promise<any> {
    const blogObj = blogDoc.toObject ? blogDoc.toObject() : (blogDoc as any);
    const authorId = blogObj.author?._id || blogObj.author;

    if (!authorId) return blogObj;

    const user = await User.findById(authorId).lean();
    if (!user) return blogObj;

    let authorName = user.email.split("@")[0];
    let profilePicture = "";

    const userProfile = await UserProfile.findOne({ userId: user._id }).lean();
    if (userProfile) {
      if (userProfile.firstName || userProfile.lastName) {
        authorName = `${userProfile.firstName || ""} ${userProfile.lastName || ""}`.trim();
      }
      if (userProfile.profilePicture) {
        profilePicture = userProfile.profilePicture;
      }
    }

    if (!profilePicture) {
      if (user.role === Role.JOB_SEEKER) {
        const jsProfile = await JobSeekerProfile.findOne({ userId: user._id }).lean();
        if (jsProfile?.profilePicture) profilePicture = jsProfile.profilePicture;
      } else if (user.role === Role.RECRUITER) {
        const recProfile: any = await RecruiterProfile.findOne({ userId: user._id }).lean();
        if (recProfile?.profilePicture) profilePicture = recProfile.profilePicture;
      }
    }

    blogObj.authorDetails = {
      _id: user._id,
      email: user.email,
      role: user.role,
      name: authorName,
      profilePicture,
    };

    return blogObj;
  }

  /**
   * Create a new Blog (JobSeeker, Recruiter, Admin)
   */
  static async createBlog(
    userId: string,
    userRole: Role,
    data: ICreateBlogInput,
    coverFile?: Express.Multer.File
  ): Promise<any> {
    let coverImage = { url: "", publicId: "" };

    if (coverFile) {
      const uploadRes = await CloudinaryService.uploadBlogImage(coverFile.buffer, coverFile.originalname);
      coverImage = { url: uploadRes.url, publicId: uploadRes.public_id };
    } else if (data.coverImage && data.coverImage.url) {
      coverImage = data.coverImage;
    } else {
      throw new ApiError(400, "Please provide a cover image for the blog");
    }

    const slug = await BlogsService.generateUniqueSlug(data.title);
    const readTime = BlogsService.calculateReadTime(data.content);
    const sanitizedContent = sanitizeHtml(data.content);

    let parsedTags: string[] = [];
    if (Array.isArray(data.tags)) {
      parsedTags = data.tags;
    } else if (typeof data.tags === "string" && data.tags.trim()) {
      parsedTags = data.tags.split(",").map((t) => t.trim()).filter(Boolean);
    }

    const isPublished = data.status === "published";

    const newBlog = await Blog.create({
      title: data.title,
      slug,
      excerpt: data.excerpt,
      content: sanitizedContent,
      coverImage,
      category: data.category,
      tags: parsedTags,
      author: userId,
      authorRole: userRole,
      status: isPublished ? "published" : "draft",
      readTime,
      publishedAt: isPublished ? new Date() : null,
    });

    return BlogsService.populateAuthorDetails(newBlog);
  }

  /**
   * Update existing Blog
   */
  static async updateBlog(
    blogId: string,
    userId: string,
    userRole: Role,
    data: IUpdateBlogInput,
    coverFile?: Express.Multer.File
  ): Promise<any> {
    const blog = await Blog.findOne({ _id: blogId, isDeleted: false });
    if (!blog) {
      throw new ApiError(404, BLOG_MESSAGES.NOT_FOUND);
    }

    // Check ownership or admin override
    if (blog.author.toString() !== userId && userRole !== Role.ADMIN) {
      throw new ApiError(403, BLOG_MESSAGES.UNAUTHORIZED);
    }

    if (data.title && data.title !== blog.title) {
      blog.title = data.title;
      blog.slug = await BlogsService.generateUniqueSlug(data.title, blog._id.toString());
    }

    if (data.excerpt) blog.excerpt = data.excerpt;
    if (data.category) blog.category = data.category;

    if (data.content) {
      blog.content = sanitizeHtml(data.content);
      blog.readTime = BlogsService.calculateReadTime(data.content);
    }

    if (data.tags !== undefined) {
      if (Array.isArray(data.tags)) {
        blog.tags = data.tags;
      } else if (typeof data.tags === "string") {
        blog.tags = data.tags.split(",").map((t) => t.trim()).filter(Boolean);
      }
    }

    if (coverFile) {
      const uploadRes = await CloudinaryService.uploadBlogImage(coverFile.buffer, coverFile.originalname);
      if (blog.coverImage?.publicId) {
        await CloudinaryService.deleteFile(blog.coverImage.publicId);
      }
      blog.coverImage = { url: uploadRes.url, publicId: uploadRes.public_id };
    } else if (data.coverImage && data.coverImage.url) {
      blog.coverImage = data.coverImage;
    }

    if (data.status && data.status !== blog.status) {
      blog.status = data.status;
      if (data.status === "published" && !blog.publishedAt) {
        blog.publishedAt = new Date();
      } else if (data.status === "draft") {
        blog.publishedAt = null;
      }
    }

    await blog.save();
    return BlogsService.populateAuthorDetails(blog);
  }

  /**
   * Delete Blog
   */
  static async deleteBlog(blogId: string, userId: string, userRole: Role): Promise<boolean> {
    const blog = await Blog.findOne({ _id: blogId, isDeleted: false });
    if (!blog) {
      throw new ApiError(404, BLOG_MESSAGES.NOT_FOUND);
    }

    if (blog.author.toString() !== userId && userRole !== Role.ADMIN) {
      throw new ApiError(403, BLOG_MESSAGES.UNAUTHORIZED);
    }

    if (blog.coverImage?.publicId) {
      await CloudinaryService.deleteFile(blog.coverImage.publicId);
    }

    blog.isDeleted = true;
    blog.deletedAt = new Date();
    await blog.save();

    await BlogView.deleteMany({ blog: blog._id });
    return true;
  }

  /**
   * Publish Blog
   */
  static async publishBlog(blogId: string, userId: string, userRole: Role): Promise<any> {
    return BlogsService.updateBlog(blogId, userId, userRole, { status: "published" });
  }

  /**
   * Unpublish Blog
   */
  static async unpublishBlog(blogId: string, userId: string, userRole: Role): Promise<any> {
    return BlogsService.updateBlog(blogId, userId, userRole, { status: "draft" });
  }

  /**
   * Get Published Blogs (Public Endpoint with Search, Filter & Pagination)
   */
  static async getPublicBlogs(query: IBlogFilterQuery): Promise<IPaginatedBlogsResult<any>> {
    const page = Math.max(1, parseInt(String(query.page || 1), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(query.limit || 10), 10)));
    const skip = (page - 1) * limit;

    const filter: any = {
      status: "published",
      isDeleted: false,
    };

    if (query.category) {
      filter.category = { $regex: new RegExp(`^${query.category.trim()}$`, "i") };
    }

    if (query.tag) {
      filter.tags = { $in: [query.tag.trim()] };
    }

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), "i");
      filter.$or = [
        { title: searchRegex },
        { excerpt: searchRegex },
        { category: searchRegex },
        { tags: { $in: [searchRegex] } },
      ];
    }

    let sortOption: any = { publishedAt: -1 };
    if (query.sort === "views") {
      sortOption = { views: -1, publishedAt: -1 };
    }

    const total = await Blog.countDocuments(filter);
    const blogs = await Blog.find(filter).sort(sortOption).skip(skip).limit(limit);

    const enrichedBlogs = await Promise.all(blogs.map((b) => BlogsService.populateAuthorDetails(b)));

    return {
      blogs: enrichedBlogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get Trending Blogs using Recency-Weighted Engagement Score
   */
  static async getTrendingBlogs(limitNum: number = 5): Promise<any[]> {
    const limit = Math.min(20, Math.max(1, limitNum));

    // Fetch published blogs from last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const blogs = await Blog.find({
      status: "published",
      isDeleted: false,
      publishedAt: { $gte: sixtyDaysAgo },
    }).lean();

    const now = Date.now();

    const scoredBlogs = blogs.map((blog) => {
      const publishedTime = blog.publishedAt ? new Date(blog.publishedAt).getTime() : new Date(blog.createdAt).getTime();
      const ageInHours = Math.max(0.5, (now - publishedTime) / (1000 * 60 * 60));

      // Trending score formula: engagement / (ageInHours + 2)^1.3
      const engagement = (blog.uniqueViews || 0) * 2 + (blog.views || 0);
      const score = (engagement + 5) / Math.pow(ageInHours + 2, 1.2);

      return { ...blog, trendingScore: score };
    });

    scoredBlogs.sort((a, b) => b.trendingScore - a.trendingScore);

    const topBlogs = scoredBlogs.slice(0, limit);

    return Promise.all(topBlogs.map((b) => BlogsService.populateAuthorDetails(b as any)));
  }

  /**
   * Get Single Blog by Slug + Record Unique/24h Deduplicated View
   */
  static async getBlogBySlug(
    slug: string,
    reqUser?: { userId: string; role: Role },
    ipAddress?: string,
    userAgent?: string
  ): Promise<any> {
    const blog = await Blog.findOne({ slug: slug.toLowerCase(), isDeleted: false });
    if (!blog) {
      throw new ApiError(404, BLOG_MESSAGES.NOT_FOUND);
    }

    // Only allow public viewing if published or if author/admin viewing draft
    if (blog.status !== "published") {
      const isOwner = reqUser && (reqUser.userId === blog.author.toString() || reqUser.role === Role.ADMIN);
      if (!isOwner) {
        throw new ApiError(404, BLOG_MESSAGES.NOT_FOUND);
      }
    }

    // Process view tracking asynchronously without blocking response
    setImmediate(async () => {
      try {
        const rawIp = ipAddress || "127.0.0.1";
        const rawAgent = userAgent || "unknown";
        const ipHash = crypto.createHash("sha256").update(`${rawIp}_${rawAgent}`).digest("hex");

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        let recentView = null;
        if (reqUser?.userId) {
          recentView = await BlogView.findOne({
            blog: blog._id,
            user: reqUser.userId,
            createdAt: { $gte: twentyFourHoursAgo },
          });
        } else {
          recentView = await BlogView.findOne({
            blog: blog._id,
            ipHash,
            createdAt: { $gte: twentyFourHoursAgo },
          });
        }

        if (!recentView) {
          await BlogView.create({
            blog: blog._id,
            user: reqUser?.userId || null,
            ipHash,
          });

          // Check unique view overall
          let isUniqueUser = false;
          if (reqUser?.userId) {
            const count = await BlogView.countDocuments({ blog: blog._id, user: reqUser.userId });
            if (count === 1) isUniqueUser = true;
          } else {
            const count = await BlogView.countDocuments({ blog: blog._id, ipHash });
            if (count === 1) isUniqueUser = true;
          }

          blog.views = (blog.views || 0) + 1;
          if (isUniqueUser) {
            blog.uniqueViews = (blog.uniqueViews || 0) + 1;
          }
          await blog.save();
        }
      } catch (err) {
        console.error("Error tracking blog view:", err);
      }
    });

    return BlogsService.populateAuthorDetails(blog);
  }

  /**
   * Get Categories with Published Blog Counts
   */
  static async getCategories(): Promise<{ name: string; count: number }[]> {
    const stats = await Blog.aggregate([
      { $match: { status: "published", isDeleted: false } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    const statMap = new Map<string, number>();
    stats.forEach((s) => statMap.set(s._id, s.count));

    const result = DEFAULT_BLOG_CATEGORIES.map((cat) => ({
      name: cat,
      count: statMap.get(cat) || 0,
    }));

    // Add any custom categories present in database
    stats.forEach((s) => {
      if (!DEFAULT_BLOG_CATEGORIES.includes(s._id)) {
        result.push({ name: s._id, count: s.count });
      }
    });

    return result;
  }

  /**
   * Get User's Own Blogs
   */
  static async getUserBlogs(userId: string, query: IBlogFilterQuery): Promise<IPaginatedBlogsResult<any>> {
    const page = Math.max(1, parseInt(String(query.page || 1), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(query.limit || 10), 10)));
    const skip = (page - 1) * limit;

    const filter: any = { author: userId, isDeleted: false };
    if (query.status) {
      filter.status = query.status;
    }

    const total = await Blog.countDocuments(filter);
    const blogs = await Blog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);

    const enrichedBlogs = await Promise.all(blogs.map((b) => BlogsService.populateAuthorDetails(b)));

    return {
      blogs: enrichedBlogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get All Blogs for Admin
   */
  static async getAdminBlogs(query: IBlogFilterQuery): Promise<IPaginatedBlogsResult<any>> {
    const page = Math.max(1, parseInt(String(query.page || 1), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(query.limit || 10), 10)));
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: false };

    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.role) filter.authorRole = query.role;
    if (query.authorId) filter.author = query.authorId;

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), "i");
      filter.$or = [{ title: searchRegex }, { excerpt: searchRegex }, { category: searchRegex }];
    }

    const total = await Blog.countDocuments(filter);
    const blogs = await Blog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);

    const enrichedBlogs = await Promise.all(blogs.map((b) => BlogsService.populateAuthorDetails(b)));

    return {
      blogs: enrichedBlogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Add a Comment to a Blog Post
   */
  static async addComment(
    blogId: string,
    reqUser: any | null,
    data: { name?: string; email?: string; content: string }
  ): Promise<any> {
    const blog = await Blog.findOne({ _id: blogId, status: "published", isDeleted: false });
    if (!blog) {
      throw new ApiError(404, "Blog post not found");
    }

    if (!data.content || !data.content.trim()) {
      throw new ApiError(400, "Comment text is required");
    }

    let authorName = data.name?.trim() || "Guest User";
    let authorEmail = data.email?.trim().toLowerCase() || "guest@jobportal.com";
    let authorAvatar = "";
    let userId: string | undefined = undefined;

    if (reqUser && reqUser.userId) {
      userId = reqUser.userId;
      const userObj = await User.findById(reqUser.userId);
      if (userObj) {
        authorEmail = userObj.email;
        authorName = userObj.email.split("@")[0];
      }

      const userProfile = await UserProfile.findOne({ userId: reqUser.userId });
      if (userProfile) {
        if (userProfile.firstName || userProfile.lastName) {
          authorName = `${userProfile.firstName || ""} ${userProfile.lastName || ""}`.trim();
        }
        if (userProfile.profilePicture) {
          authorAvatar = userProfile.profilePicture;
        }
      }

      if (!authorAvatar) {
        if (reqUser.role === Role.JOB_SEEKER) {
          const jsProfile: any = await JobSeekerProfile.findOne({ userId: reqUser.userId });
          if (jsProfile?.profilePicture) authorAvatar = jsProfile.profilePicture;
        } else if (reqUser.role === Role.RECRUITER) {
          const recProfile: any = await RecruiterProfile.findOne({ userId: reqUser.userId });
          if (recProfile?.profilePicture) authorAvatar = recProfile.profilePicture;
        }
      }
    }

    const cleanContent = sanitizeHtml(data.content.trim());

    const comment = await BlogComment.create({
      blog: blog._id,
      user: userId,
      name: authorName,
      email: authorEmail,
      avatar: authorAvatar,
      content: cleanContent,
      isApproved: true,
    });

    // Increment blog comments count
    await Blog.findByIdAndUpdate(blog._id, { $inc: { commentsCount: 1 } });

    return comment;
  }

  /**
   * Get Comments for a Blog Post
   */
  static async getComments(blogId: string): Promise<any[]> {
    const comments = await BlogComment.find({
      blog: blogId,
      isApproved: true,
      isDeleted: false,
    }).sort({ createdAt: -1 });

    return comments;
  }

  /**
   * Delete a Comment
   */
  static async deleteComment(commentId: string, userId: string, userRole: Role): Promise<void> {
    const comment = await BlogComment.findById(commentId);
    if (!comment || comment.isDeleted) {
      throw new ApiError(404, "Comment not found");
    }

    const isAuthor = comment.user && comment.user.toString() === userId.toString();
    const isAdmin = userRole === Role.ADMIN;

    if (!isAuthor && !isAdmin) {
      throw new ApiError(403, "You do not have permission to delete this comment");
    }

    comment.isDeleted = true;
    await comment.save();

    await Blog.findByIdAndUpdate(comment.blog, { $inc: { commentsCount: -1 } });
  }
}
