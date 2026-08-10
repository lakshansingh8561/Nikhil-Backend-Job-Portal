import { Router } from "express";
import multer from "multer";
import { UploadController } from "./upload.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max file size
  },
});

const router = Router();

// Protect upload endpoints
router.use(authenticate);

// Profile Image upload route -> 'Job-portal/Profile-Images'
router.post(
  "/profile-image",
  upload.single("file"),
  UploadController.uploadProfileImage
);

// Resume / PDF upload route -> 'Job-portal/resumes'
router.post(
  "/resume",
  upload.single("file"),
  UploadController.uploadResume
);

// General attachment route
router.post(
  "/file",
  upload.single("file"),
  UploadController.uploadGeneralFile
);

export const uploadRoutes = router;
export default router;
