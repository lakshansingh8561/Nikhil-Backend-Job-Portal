import { Router } from "express";
import { RecruiterController } from "./recruiter.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { RecruiterValidation } from "./recruiter.validation";
import { Role } from "../../common/enums";

const router = Router();

router.post(
  "/profile",
  authenticate,
  authorize(Role.RECRUITER),
  validate(RecruiterValidation.createProfile),
  RecruiterController.createProfile
);

router.get(
  "/profile",
  authenticate,
  authorize(Role.RECRUITER),
  RecruiterController.getProfile
);

router.put(
  "/profile",
  authenticate,
  authorize(Role.RECRUITER),
  validate(RecruiterValidation.updateProfile),
  RecruiterController.updateProfile
);

export default router;