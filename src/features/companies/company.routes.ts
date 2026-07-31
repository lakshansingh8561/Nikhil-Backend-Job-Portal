import { Router } from "express";
import { CompanyController } from "./company.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { CompanyValidation } from "./company.validation";
import { Role } from "../../common/enums";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize(Role.RECRUITER),
  validate(CompanyValidation.createCompany),
  CompanyController.createCompany
);

router.get(
  "/",
  authenticate,
  authorize(Role.RECRUITER),
  CompanyController.getMyCompany
);

router.get(
  "/my",
  authenticate,
  authorize(Role.RECRUITER),
  CompanyController.getMyCompany
);

router.put(
  "/",
  authenticate,
  authorize(Role.RECRUITER),
  validate(CompanyValidation.updateCompany),
  CompanyController.updateCompany
);

router.put(
  "/:id",
  authenticate,
  authorize(Role.RECRUITER),
  validate(CompanyValidation.updateCompany),
  CompanyController.updateCompany
);

export default router;