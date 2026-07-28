import { Router } from "express";
import { JobController } from "./jobs.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { JobValidation } from "./jobs.validation";
import { Role } from "../../common/enums";

const router = Router();

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/

router.get("/", JobController.getAllJobs);

router.get("/:id", JobController.getJobById);

/*
|--------------------------------------------------------------------------
| Recruiter Routes
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  authenticate,
  authorize(Role.RECRUITER),
  validate(JobValidation.createJob),
  JobController.createJob
);

router.get(
  "/my/jobs",
  authenticate,
  authorize(Role.RECRUITER),
  JobController.getMyJobs
);

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