import { NextFunction, Request, Response } from "express";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { MembershipRepository } from "./membership.repository";
import { MEMBERSHIP_MESSAGES } from "./membership.constants";
import { IMembership } from "../../database/models";
import { MembershipService } from "./membership.service";
import { Role } from "../../common/enums/role.enum";

/**
 * Middleware: Requires ANY active job seeker subscription
 */
export const requireMembership = () => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Unauthorized access.");
      }

      const activeSub = await MembershipRepository.findActiveSubscription(userId);
      if (!activeSub || new Date() > new Date(activeSub.endDate)) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          MEMBERSHIP_MESSAGES.NO_ACTIVE_SUBSCRIPTION
        );
      }

      (req as any).subscription = activeSub;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware: Requires PRO or PREMIUM active job seeker subscription
 */
export const requireProMembership = () => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Unauthorized access.");
      }

      const activeSub = await MembershipRepository.findActiveSubscription(userId);
      const planName = (activeSub?.membershipId as unknown as IMembership)?.name || activeSub?.planName;

      if (
        !activeSub ||
        new Date() > new Date(activeSub.endDate) ||
        (planName !== "Pro" && planName !== "Premium")
      ) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          MEMBERSHIP_MESSAGES.PRO_PLAN_REQUIRED
        );
      }

      (req as any).subscription = activeSub;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware: Requires PREMIUM active job seeker subscription strictly
 */
export const requirePremiumMembership = () => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Unauthorized access.");
      }

      const activeSub = await MembershipRepository.findActiveSubscription(userId);
      const planName = (activeSub?.membershipId as unknown as IMembership)?.name || activeSub?.planName;

      if (
        !activeSub ||
        new Date() > new Date(activeSub.endDate) ||
        planName !== "Premium"
      ) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          MEMBERSHIP_MESSAGES.PREMIUM_PLAN_REQUIRED
        );
      }

      (req as any).subscription = activeSub;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware: Requires ANY active Recruiter subscription
 */
export const requireRecruiterMembership = () => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== Role.RECRUITER) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, MEMBERSHIP_MESSAGES.ONLY_RECRUITERS_ALLOWED);
      }

      const activeSub = await MembershipRepository.findActiveSubscription(user.userId);
      (req as any).subscription = activeSub;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware: Requires Professional or Enterprise Recruiter plan
 */
export const requireProfessionalRecruiter = () => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== Role.RECRUITER) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, MEMBERSHIP_MESSAGES.ONLY_RECRUITERS_ALLOWED);
      }

      const activeSub = await MembershipRepository.findActiveSubscription(user.userId);
      const planName = (activeSub?.membershipId as unknown as IMembership)?.name || activeSub?.planName;

      if (
        !activeSub ||
        new Date() > new Date(activeSub.endDate) ||
        (planName !== "Professional" && planName !== "Enterprise")
      ) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          MEMBERSHIP_MESSAGES.PROFESSIONAL_RECRUITER_REQUIRED
        );
      }

      (req as any).subscription = activeSub;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware: Requires Enterprise Recruiter plan strictly
 */
export const requireEnterpriseRecruiter = () => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== Role.RECRUITER) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, MEMBERSHIP_MESSAGES.ONLY_RECRUITERS_ALLOWED);
      }

      const activeSub = await MembershipRepository.findActiveSubscription(user.userId);
      const planName = (activeSub?.membershipId as unknown as IMembership)?.name || activeSub?.planName;

      if (
        !activeSub ||
        new Date() > new Date(activeSub.endDate) ||
        planName !== "Enterprise"
      ) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          MEMBERSHIP_MESSAGES.ENTERPRISE_RECRUITER_REQUIRED
        );
      }

      (req as any).subscription = activeSub;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware: Check recruiter job posting limit (Max 3 active jobs for Free plan)
 */
export const checkJobPostingLimit = () => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Unauthorized access.");
      }

      await MembershipService.verifyJobPostingLimit(userId);
      next();
    } catch (error) {
      next(error);
    }
  };
};
