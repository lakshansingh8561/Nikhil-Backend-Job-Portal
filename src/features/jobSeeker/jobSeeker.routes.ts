import { Router } from "express";
import { JobSeekerController } from "./jobSeeker.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { Role } from "../../common/enums";
import { JobSeekerValidation } from "./jobSeeker.validation";

const router = Router();

/**
 * Public Routes: Get All Candidates (Paginated) & Single Candidate Profile
 */
router.get("/all", JobSeekerController.getAllProfiles);
router.get("/profile/:id", JobSeekerController.getProfileById);

/**
 * Authenticated Job Seeker Profile Routes
 */
router.post(
  "/profile",
  authenticate,
  authorize(Role.JOB_SEEKER),
  validate(JobSeekerValidation.createProfile),
  JobSeekerController.createProfile
);

router.get(
  "/profile",
  authenticate,
  authorize(Role.JOB_SEEKER),
  JobSeekerController.getProfile
);

router.put(
  "/profile",
  authenticate,
  authorize(Role.JOB_SEEKER),
  validate(JobSeekerValidation.updateProfile),
  JobSeekerController.updateProfile
);

export default router;