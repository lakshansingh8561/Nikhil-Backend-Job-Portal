import { Router } from "express";
import multer from "multer";
import { BlogsController } from "./blogs.controller";
import { authenticate, optionalAuthenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { Role } from "../../common/enums/role.enum";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB file size limit
  },
});

const router = Router();

// ================= PUBLIC BLOG ROUTES =================
router.get("/", BlogsController.getPublicBlogs);
router.get("/trending", BlogsController.getTrendingBlogs);
router.get("/categories", BlogsController.getCategories);

// ================= USER OWNED BLOG ROUTES =================
router.get("/my", authenticate, BlogsController.getUserBlogs);

// ================= ADMIN MANAGEMENT ROUTE =================
router.get(
  "/admin/all",
  authenticate,
  authorize(Role.ADMIN),
  BlogsController.getAdminBlogs
);

// ================= AUTHENTICATED BLOG ACTIONS =================
router.post(
  "/",
  authenticate,
  authorize(Role.JOB_SEEKER, Role.RECRUITER, Role.ADMIN),
  upload.single("coverImage"),
  BlogsController.createBlog
);

router.post(
  "/upload-media",
  authenticate,
  upload.single("file"),
  BlogsController.uploadContentMedia
);

router.put(
  "/:id",
  authenticate,
  upload.single("coverImage"),
  BlogsController.updateBlog
);

router.delete("/:id", authenticate, BlogsController.deleteBlog);

router.patch("/:id/publish", authenticate, BlogsController.publishBlog);
router.patch("/:id/unpublish", authenticate, BlogsController.unpublishBlog);

// ================= BLOG COMMENT ROUTES =================
router.get("/:blogId/comments", BlogsController.getComments);
router.post("/:blogId/comments", optionalAuthenticate, BlogsController.addComment);
router.delete("/comments/:commentId", authenticate, BlogsController.deleteComment);

// Single blog details by slug (Must be placed after exact static routes like /trending, /categories, /my)
router.get("/:slug", optionalAuthenticate, BlogsController.getBlogBySlug);

export const blogRoutes = router;
export default router;
