import { Router } from "express";
import multer from "multer";
import { AIController } from "./ai.controller";
import { authenticate, optionalAuthenticate } from "../../common/middlewares/auth.middleware";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are supported for resume parsing."));
    }
  },
});

const router = Router();

/**
 * @route POST /api/v1/ai/parse-resume
 * @desc Parse PDF resume into structured JSON candidate profile
 * @access Public / Authenticated
 */
router.post("/parse-resume", upload.single("resume"), AIController.parseResume);

/**
 * @route POST /api/v1/ai/analyze-match
 * @desc Calculate ATS Match score percentage & recommendations for job vs profile
 * @access Public / Authenticated
 */
router.post("/analyze-match", optionalAuthenticate, AIController.analyzeMatch);

/**
 * @route POST /api/v1/ai/generate-job-description
 * @desc Auto-generate structured job description & skills for recruiters
 * @access Authenticated
 */
router.post("/generate-job-description", AIController.generateJobDescription);

export default router;
