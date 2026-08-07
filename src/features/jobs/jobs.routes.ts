import { Router } from "express";
import { JobController } from "./jobs.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { checkJobPostingLimit } from "../memberships/membership.middleware";
import { JobValidation } from "./jobs.validation";
import { Role } from "../../common/enums";

const router = Router();

/*
|--------------------------------------------------------------------------
| Recruiter & Public Routes (Specific paths FIRST before /:id)
|--------------------------------------------------------------------------
*/

router.get(
  "/my/jobs",
  authenticate,
  authorize(Role.RECRUITER),
  JobController.getMyJobs
);

router.post(
  "/",
  authenticate,
  authorize(Role.RECRUITER),
  checkJobPostingLimit(),
  validate(JobValidation.createJob),
  JobController.createJob
);

router.get("/", JobController.getAllJobs);

router.get("/:id", JobController.getJobById);

router.put(
  "/:id",
  authenticate,
  authorize(Role.RECRUITER),
  validate(JobValidation.updateJob),
  JobController.updateJob
);

router.delete(
  "/:id",
  authenticate,
  authorize(Role.RECRUITER),
  JobController.deleteJob
);

export default router;