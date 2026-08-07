import { Router } from "express";
import { MembershipController } from "./membership.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorize } from "../../common/middlewares/role.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { subscribeSchema, cancelSubscriptionSchema } from "./membership.validation";
import { Role } from "../../common/enums/role.enum";

const router = Router();

/**
 * Public Routes: GET /api/v1/memberships
 */
router.get("/", MembershipController.getMemberships);
router.get("/recruiter", MembershipController.getRecruiterMemberships);

/**
 * Protected Job Seeker Routes
 */
router.get("/current", authenticate, authorize(Role.JOB_SEEKER), MembershipController.getCurrentSubscription);
router.post("/subscribe", authenticate, authorize(Role.JOB_SEEKER), validate(subscribeSchema), MembershipController.subscribe);
router.post("/cancel", authenticate, authorize(Role.JOB_SEEKER), validate(cancelSubscriptionSchema), MembershipController.cancelSubscription);
router.get("/history", authenticate, authorize(Role.JOB_SEEKER), MembershipController.getHistory);

/**
 * Protected Recruiter Routes
 */
router.get("/recruiter/current", authenticate, authorize(Role.RECRUITER), MembershipController.getCurrentRecruiterSubscription);
router.post("/recruiter/subscribe", authenticate, authorize(Role.RECRUITER), validate(subscribeSchema), MembershipController.subscribe);
router.post("/recruiter/cancel", authenticate, authorize(Role.RECRUITER), validate(cancelSubscriptionSchema), MembershipController.cancelSubscription);
router.get("/recruiter/history", authenticate, authorize(Role.RECRUITER), MembershipController.getHistory);

export const membershipRoutes = router;
