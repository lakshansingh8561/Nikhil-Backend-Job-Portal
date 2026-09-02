import { Request, Response, NextFunction } from "express";
import { BlogsService } from "./blogs.service";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { ApiError } from "../../common/utils/ApiError";
import { CloudinaryService } from "../../common/services/cloudinary.service";
import { BLOG_MESSAGES } from "./blogs.constants";
import { createBlogSchema, updateBlogSchema } from "./blogs.validation";

export class BlogsController {
  /**
   * Create Blog (JobSeeker, Recruiter, Admin)
   */
  static createBlog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        throw new ApiError(401, "Unauthorized");
      }

      // Parse tags if sent as JSON string in multipart form
      if (typeof req.body.tags === "string" && req.body.tags.startsWith("[")) {
        try {
          req.body.tags = JSON.parse(req.body.tags);
        } catch (e) {
          // Keep as string
        }
      }

      const validatedData = createBlogSchema.parse(req.body);
      const coverFile = req.file;

      const blog = await BlogsService.createBlog(user.userId, user.role, validatedData, coverFile);

      return res
        .status(201)
        .json(new ApiResponse(true, BLOG_MESSAGES.CREATED, blog));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Update Blog
   */
  static updateBlog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        throw new ApiError(401, "Unauthorized");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);

      if (typeof req.body.tags === "string" && req.body.tags.startsWith("[")) {
        try {
          req.body.tags = JSON.parse(req.body.tags);
        } catch (e) {
          // Keep as string
        }
      }

      const validatedData = updateBlogSchema.parse(req.body);
      const coverFile = req.file;

      const blog = await BlogsService.updateBlog(id, user.userId, user.role, validatedData, coverFile);

      return res
        .status(200)
        .json(new ApiResponse(true, BLOG_MESSAGES.UPDATED, blog));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Delete Blog
   */
  static deleteBlog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        throw new ApiError(401, "Unauthorized");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
      await BlogsService.deleteBlog(id, user.userId, user.role);

      return res
        .status(200)
        .json(new ApiResponse(true, BLOG_MESSAGES.DELETED));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Publish Blog
   */
  static publishBlog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        throw new ApiError(401, "Unauthorized");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
      const blog = await BlogsService.publishBlog(id, user.userId, user.role);

      return res
        .status(200)
        .json(new ApiResponse(true, BLOG_MESSAGES.PUBLISHED, blog));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Unpublish Blog
   */
  static unpublishBlog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        throw new ApiError(401, "Unauthorized");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
      const blog = await BlogsService.unpublishBlog(id, user.userId, user.role);

      return res
        .status(200)
        .json(new ApiResponse(true, BLOG_MESSAGES.UNPUBLISHED, blog));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Get Published Blogs (Public List)
   */
  static getPublicBlogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await BlogsService.getPublicBlogs(req.query as any);
      return res
        .status(200)
        .json(new ApiResponse(true, "Published blogs fetched successfully", result));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Get Trending Blogs
   */
  static getTrendingBlogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 5;
      const trendingBlogs = await BlogsService.getTrendingBlogs(limit);

      return res
        .status(200)
        .json(new ApiResponse(true, "Trending blogs fetched successfully", { blogs: trendingBlogs }));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Get Categories with Counts
   */
  static getCategories = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await BlogsService.getCategories();
      return res
        .status(200)
        .json(new ApiResponse(true, "Blog categories fetched successfully", { categories }));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Get Current User's Own Blogs
   */
  static getUserBlogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        throw new ApiError(401, "Unauthorized");
      }

      const result = await BlogsService.getUserBlogs(user.userId, req.query as any);
      return res
        .status(200)
        .json(new ApiResponse(true, "User blogs fetched successfully", result));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Get All Blogs for Admin Management
   */
  static getAdminBlogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await BlogsService.getAdminBlogs(req.query as any);
      return res
        .status(200)
        .json(new ApiResponse(true, "Admin blogs list fetched successfully", result));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Get Single Blog by Slug (Public)
   */
  static getBlogBySlug = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : (req.params.slug as string);
      const reqUser = (req as any).user;
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
      const userAgent = req.headers["user-agent"] || "";

      const blog = await BlogsService.getBlogBySlug(slug, reqUser, ipAddress, userAgent);

      return res
        .status(200)
        .json(new ApiResponse(true, "Blog details fetched successfully", blog));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Upload Media inside Blog Editor
   */
  static uploadContentMedia = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ApiError(400, "Please select an image/document file to upload");
      }

      const result = await CloudinaryService.uploadBlogImage(req.file.buffer, req.file.originalname);

      return res.status(200).json(
        new ApiResponse(true, "Blog media asset uploaded successfully", {
          url: result.url,
          public_id: result.public_id,
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
          fileSize: req.file.size,
        })
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * Post Comment on Blog
   */
  static addComment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const blogId = Array.isArray(req.params.blogId) ? req.params.blogId[0] : (req.params.blogId as string);
      const reqUser = (req as any).user || null;

      const comment = await BlogsService.addComment(blogId, reqUser, req.body);

      return res
        .status(201)
        .json(new ApiResponse(true, "Comment posted successfully", comment));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Get Comments for Blog
   */
  static getComments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const blogId = Array.isArray(req.params.blogId) ? req.params.blogId[0] : (req.params.blogId as string);
      const comments = await BlogsService.getComments(blogId);

      return res
        .status(200)
        .json(new ApiResponse(true, "Blog comments fetched successfully", { comments }));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Delete Comment
   */
  static deleteComment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        throw new ApiError(401, "Unauthorized");
      }

      const commentId = Array.isArray(req.params.commentId) ? req.params.commentId[0] : (req.params.commentId as string);
      await BlogsService.deleteComment(commentId, user.userId, user.role);

      return res
        .status(200)
        .json(new ApiResponse(true, "Comment deleted successfully"));
    } catch (err) {
      next(err);
    }
  };
}
