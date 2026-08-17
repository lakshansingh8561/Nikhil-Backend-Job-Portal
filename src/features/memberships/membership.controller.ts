import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { MembershipService } from "./membership.service";
import { MEMBERSHIP_MESSAGES } from "./membership.constants";
import { Role } from "../../common/enums/role.enum";

export class MembershipController {
  /**
   * GET /api/v1/memberships - Get all active Job Seeker plans
   */
  static getMemberships = asyncHandler(
    async (req: Request, res: Response) => {
      const currency = (req.query.currency as "USD" | "INR") || undefined;
      const plans = await MembershipService.getActiveMemberships(Role.JOB_SEEKER, currency);

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            true,
            MEMBERSHIP_MESSAGES.FETCH_SUCCESS,
            plans
          )
        );
    }
  );

  /**
   * GET /api/v1/memberships/recruiter - Get all active Recruiter plans
   */
  static getRecruiterMemberships = asyncHandler(
    async (req: Request, res: Response) => {
      const currency = (req.query.currency as "USD" | "INR") || undefined;
      const plans = await MembershipService.getActiveMemberships(Role.RECRUITER, currency);

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            true,
            MEMBERSHIP_MESSAGES.FETCH_SUCCESS,
            plans
          )
        );
    }
  );

  // =========================================================================
  // ADMIN MEMBERSHIP MANAGEMENT ENDPOINTS
  // =========================================================================
  static getAllAdminMemberships = asyncHandler(
    async (_req: Request, res: Response) => {
      const plans = await MembershipService.getAllAdminMemberships();
      res
        .status(HTTP_STATUS.OK)
        .json(new ApiResponse(true, "All membership plans fetched for Admin.", plans));
    }
  );

  static createMembershipPlan = asyncHandler(
    async (req: Request, res: Response) => {
      const plan = await MembershipService.createMembershipPlan(req.body);
      res
        .status(HTTP_STATUS.CREATED)
        .json(new ApiResponse(true, "Membership plan created successfully.", plan));
    }
  );

  static updateMembershipPlan = asyncHandler(
    async (req: Request, res: Response) => {
      const id = req.params.id as string;
      const plan = await MembershipService.updateMembershipPlan(id, req.body);
      res
        .status(HTTP_STATUS.OK)
        .json(new ApiResponse(true, "Membership plan updated successfully.", plan));
    }
  );

  static toggleMembershipStatus = asyncHandler(
    async (req: Request, res: Response) => {
      const id = req.params.id as string;
      const plan = await MembershipService.toggleMembershipStatus(id);
      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            true,
            `Membership plan ${plan.isActive ? "activated" : "deactivated"} successfully.`,
            plan
          )
        );
    }
  );

  static deleteMembershipPlan = asyncHandler(
    async (req: Request, res: Response) => {
      const id = req.params.id as string;
      const result = await MembershipService.deleteMembershipPlan(id);
      res
        .status(HTTP_STATUS.OK)
        .json(new ApiResponse(true, result.message, null));
    }
  );

  /**
   * GET /api/v1/memberships/current - Get current logged-in user's subscription
   */
  static getCurrentSubscription = asyncHandler(
    async (req: Request, res: Response) => {
      const userId = (req as any).user.userId;
      const data = await MembershipService.getCurrentSubscription(userId);

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            true,
            MEMBERSHIP_MESSAGES.CURRENT_SUBSCRIPTION_SUCCESS,
            data
          )
        );
    }
  );

  /**
   * GET /api/v1/memberships/recruiter/current - Get current logged-in recruiter subscription & usage
   */
  static getCurrentRecruiterSubscription = asyncHandler(
    async (req: Request, res: Response) => {
      const userId = (req as any).user.userId;
      const data = await MembershipService.getCurrentRecruiterSubscription(userId);

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            true,
            MEMBERSHIP_MESSAGES.CURRENT_SUBSCRIPTION_SUCCESS,
            data
          )
        );
    }
  );

  /**
   * POST /api/v1/memberships/subscribe - Subscribe to a plan
   */
  static subscribe = asyncHandler(
    async (req: Request, res: Response) => {
      const userId = (req as any).user.userId;
      const userRole = (req as any).user.role;
      const { membershipId } = req.body;

      const result = await MembershipService.subscribe(userId, userRole, membershipId);

      res
        .status(HTTP_STATUS.CREATED)
        .json(
          new ApiResponse(
            true,
            result.message,
            result.subscription
          )
        );
    }
  );

  /**
   * POST /api/v1/memberships/cancel - Cancel current active subscription
   */
  static cancelSubscription = asyncHandler(
    async (req: Request, res: Response) => {
      const userId = (req as any).user.userId;
      const result = await MembershipService.cancelSubscription(userId);

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            true,
            result.message,
            result.subscription
          )
        );
    }
  );

  /**
   * GET /api/v1/memberships/history - Get subscription history
   */
  static getHistory = asyncHandler(
    async (req: Request, res: Response) => {
      const userId = (req as any).user.userId;
      const history = await MembershipService.getSubscriptionHistory(userId);

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            true,
            MEMBERSHIP_MESSAGES.HISTORY_SUCCESS,
            history
          )
        );
    }
  );
}
