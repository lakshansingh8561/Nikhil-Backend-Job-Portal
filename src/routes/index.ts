import { Router } from "express";
import { authRoutes } from "../features/auth";
import { jobSeekerRoutes } from "../features/jobSeeker";
import { companyRoutes } from "../features/companies";
import { applicationRoutes } from "../features/applications";
import { adminRoutes } from "../features/admin";
import { recruiterRoutes } from "../features/recruiters";
import { jobRoutes } from "../features/jobs";
import notificationRoutes from "../features/notifications/notification.routes";
import { chatRoutes } from "../features/chat";
import { locationRoutes } from "../features/location";
import { membershipRoutes } from "../features/memberships";
import { paymentRoutes } from "../features/payments";
import { uploadRoutes } from "../features/upload/upload.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/job-seeker", jobSeekerRoutes);
router.use("/recruiter", recruiterRoutes);
router.use("/company", companyRoutes);
router.use("/applications", applicationRoutes);
router.use("/admin", adminRoutes);
router.use("/jobs", jobRoutes);
router.use("/notifications", notificationRoutes);
router.use("/chat", chatRoutes);
router.use("/location", locationRoutes);
router.use("/memberships", membershipRoutes);
router.use("/payments", paymentRoutes);
router.use("/upload", uploadRoutes);

export default router;
