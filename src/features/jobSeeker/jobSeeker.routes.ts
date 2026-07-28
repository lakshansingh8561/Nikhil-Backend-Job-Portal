import { Router } from "express";
import { JobSeekerController } from "./jobSeeker.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { Role } from "../../common/enums";
import { JobSeekerValidation } from "./jobSeeker.validation";

const router = Router();

/**
 * Create Profile
 */
router.post(
  "/profile",
  authenticate,
  authorize(Role.JOB_SEEKER),
  validate(JobSeekerValidation.createProfile),
  JobSeekerController.createProfile
);

/**
 * Get My Profile
 */
router.get(
  "/profile",
  authenticate,
  authorize(Role.JOB_SEEKER),
  JobSeekerController.getProfile
);

/**
 * Update My Profile
 */
router.put(
  "/profile",
  authenticate,
  authorize(Role.JOB_SEEKER),
  validate(JobSeekerValidation.updateProfile),
  JobSeekerController.updateProfile
);

export default router;