import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validate } from "../../common/middlewares/validate.middleware";
import { AuthValidation } from "./auth.validation";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { Role } from "../../common/enums";
import { authorize } from "../../common/middlewares/role.middleware";
const router = Router();

/**
 * Public Routes
 */
router.post(
  "/send-otp",
  AuthController.sendOtp
);

router.post(
  "/verify-otp",
  AuthController.verifyOtp
);

router.post(
  "/register",
  validate(AuthValidation.register),
  AuthController.register
);

router.post(
  "/login",
  validate(AuthValidation.login),
  AuthController.login
);

router.post(
  "/google",
  AuthController.googleAuth
);

router.post(
  "/forgot-password/send-otp",
  AuthController.sendForgotPasswordOtp
);

router.post(
  "/forgot-password/reset",
  AuthController.resetPasswordWithOtp
);

/**
 * Protected Routes
 */
router.get(
  "/me",
  authenticate,
  AuthController.me
);

router.post(
  "/logout",
  authenticate,
  AuthController.logout
);

router.post(
  "/change-password",
  authenticate,
  AuthController.changePassword
);
router.get(
  "/admin",
  authenticate,
  authorize(Role.ADMIN),
  (_req, res) => {
    res.json({
      success: true,
      message: "Welcome Admin",
    });
  }
);
router.get(
  "/recruiter",
  authenticate,
  authorize(Role.RECRUITER),
  (_req, res) => {
    res.json({
      success: true,
      message: "Welcome Recruiter",
    });
  }
);
router.get(
  "/job-seeker",
  authenticate,
  authorize(Role.JOB_SEEKER),
  (_req, res) => {
    res.json({
      success: true,
      message: "Welcome Job Seeker",
    });
  }
);
router.post(
  "/refresh-token",
  validate(AuthValidation.refresh),
  AuthController.refreshToken
);
export default router;