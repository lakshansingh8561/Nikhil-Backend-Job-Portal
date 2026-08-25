import { Router } from "express";
import { PostsController } from "./posts.controller";
import { PostValidation } from "./posts.validation";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { validate } from "../../common/middlewares/validate.middleware";

const router = Router();

// Protect all post routes with authentication
router.use(authenticate);

// --- Feed & collections ------------------------------------------------------
// Static segments are declared before "/:id" so they aren't swallowed by it.
router.get("/feed", PostsController.getFeed);
router.get("/saved", PostsController.getSavedPosts);
router.get("/user/:userId", PostsController.getUserPosts);

// --- Comment sub-resources ---------------------------------------------------
router.get("/comments/:commentId/replies", PostsController.getCommentReplies);
router.put(
  "/comments/:commentId/reactions",
  validate(PostValidation.reactToPost),
  PostsController.reactToComment
);
router.patch(
  "/comments/:commentId",
  validate(PostValidation.updateComment),
  PostsController.updateComment
);
router.delete("/comments/:commentId", PostsController.deleteComment);

// --- Post actions ------------------------------------------------------------
router.post("/", validate(PostValidation.createPost), PostsController.createPost);
router.get("/:id", PostsController.getPostById);
router.patch("/:id", validate(PostValidation.updatePost), PostsController.updatePost);
router.delete("/:id", PostsController.deletePost);

router.put("/:id/reactions", validate(PostValidation.reactToPost), PostsController.reactToPost);
router.get("/:id/reactions", PostsController.getPostReactions);
router.post("/:id/repost", validate(PostValidation.repost), PostsController.repost);
router.post("/:id/save", PostsController.toggleSave);

router.post("/:id/comments", validate(PostValidation.addComment), PostsController.addComment);
router.get("/:id/comments", PostsController.getComments);

// Legacy binary like endpoint, superseded by PUT /:id/reactions
router.post("/:id/like", PostsController.toggleLike);

export default router;
