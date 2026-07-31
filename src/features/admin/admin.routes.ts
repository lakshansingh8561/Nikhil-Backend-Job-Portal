import { Router } from "express";
import { AdminController } from "./admin.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { Role } from "../../common/enums";

const router = Router();

/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  authenticate,
  authorize(Role.ADMIN),
  AdminController.getDashboardStats
);

/*
|--------------------------------------------------------------------------
| User Management
|--------------------------------------------------------------------------
*/

router.get(
  "/users",
  authenticate,
  authorize(Role.ADMIN),
  AdminController.getAllUsers
);

router.get(
  "/users/:id",
  authenticate,
  authorize(Role.ADMIN),
  AdminController.getUserById
);

router.patch(
  "/users/:id/block",
  authenticate,
  authorize(Role.ADMIN),
  AdminController.blockUser
);

router.patch(
  "/users/:id/unblock",
  authenticate,
  authorize(Role.ADMIN),
  AdminController.unblockUser
);

/*
|--------------------------------------------------------------------------
| Job Moderation
|--------------------------------------------------------------------------
*/

router.get(
  "/jobs",
  authenticate,
  authorize(Role.ADMIN),
  AdminController.getAllJobs
);

router.delete(
  "/jobs/:id",
  authenticate,
  authorize(Role.ADMIN),
  AdminController.deleteJob
);

/*
|--------------------------------------------------------------------------
| Application Moderation
|--------------------------------------------------------------------------
*/

router.get(
  "/applications",
  authenticate,
  authorize(Role.ADMIN),
  AdminController.getAllApplications
);

export default router;