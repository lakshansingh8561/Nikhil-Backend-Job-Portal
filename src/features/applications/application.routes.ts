import { Router } from "express";
import { ApplicationController } from "./application.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { ApplicationValidation } from "./application.validation";
import { Role } from "../../common/enums";

const router = Router();


router.post(
  "/jobs/:jobId/apply",
  authenticate,
  authorize(Role.JOB_SEEKER),
  validate(ApplicationValidation.applyJob),
  ApplicationController.applyJob
);

router.get(
  "/my",
  authenticate,
  authorize(Role.JOB_SEEKER),
  ApplicationController.getMyApplications
);

router.get(
  "/recruiter/all",
  authenticate,
  authorize(Role.RECRUITER),
  ApplicationController.getRecruiterAllApplications
);



router.get(
  "/jobs/:jobId",
  authenticate,
  authorize(Role.RECRUITER),
  ApplicationController.getApplicationsForJob
);

router.put(
  "/:id/status",
  authenticate,
  authorize(Role.RECRUITER),
  validate(ApplicationValidation.updateStatus),
  ApplicationController.updateStatus
);

export default router;