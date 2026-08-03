import { Router } from "express";
import { authRoutes } from "../features/auth";
import { jobSeekerRoutes } from "../features/jobSeeker";
import { companyRoutes } from "../features/companies";
import { applicationRoutes } from "../features/applications";
import { adminRoutes } from "../features/admin";
import { recruiterRoutes } from "../features/recruiters";
import { jobRoutes } from "../features/jobs";
import notificationRoutes from "../features/notifications/notification.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/job-seeker", jobSeekerRoutes);
router.use("/recruiter", recruiterRoutes);
router.use("/company", companyRoutes);
router.use("/applications", applicationRoutes);
router.use("/admin", adminRoutes);
router.use("/jobs", jobRoutes);
router.use("/notifications", notificationRoutes);
export default router;

