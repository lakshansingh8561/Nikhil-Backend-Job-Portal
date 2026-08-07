import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AdminService } from "./admin.service";
import { PaymentService } from "../payments/payment.service";
import { ADMIN_MESSAGES } from "./admin.constants";

export class AdminController {
  static getDashboardStats = asyncHandler(
    async (_req: Request, res: Response) => {
      const stats = await AdminService.getDashboardStats();

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          ADMIN_MESSAGES.DASHBOARD_FETCHED,
          stats
        )
      );
    }
  );

  static getAllUsers = asyncHandler(
    async (req: Request, res: Response) => {
      const usersData = await AdminService.getAllUsers(req.query as any);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          ADMIN_MESSAGES.USERS_FETCHED,
          usersData
        )
      );
    }
  );

  static getUserById = asyncHandler(
    async (req: Request, res: Response) => {
      const user = await AdminService.getUserById(
        req.params.id as string
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          ADMIN_MESSAGES.USER_FETCHED,
          user
        )
      );
    }
  );

  static blockUser = asyncHandler(
    async (req: Request, res: Response) => {
      const user = await AdminService.blockUser(
        req.params.id as string
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          ADMIN_MESSAGES.USER_BLOCKED,
          user
        )
      );
    }
  );

  static unblockUser = asyncHandler(
    async (req: Request, res: Response) => {
      const user = await AdminService.unblockUser(
        req.params.id as string
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          ADMIN_MESSAGES.USER_UNBLOCKED,
          user
        )
      );
    }
  );

  static getAllJobs = asyncHandler(
    async (req: Request, res: Response) => {
      const jobsData = await AdminService.getAllJobs(req.query as any);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          ADMIN_MESSAGES.JOBS_FETCHED,
          jobsData
        )
      );
    }
  );

  static deleteJob = asyncHandler(
    async (req: Request, res: Response) => {
      await AdminService.deleteJob(
        req.params.id as string
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          ADMIN_MESSAGES.JOB_DELETED
        )
      );
    }
  );

  static getAllApplications = asyncHandler(
    async (req: Request, res: Response) => {
      const applicationsData = await AdminService.getAllApplications(
        req.query as any
      );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          "Applications fetched successfully",
          applicationsData
        )
      );
    }
  );

  static getMembershipStats = asyncHandler(
    async (_req: Request, res: Response) => {
      const stats = await AdminService.getMembershipStats();

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          "Membership statistics fetched successfully",
          stats
        )
      );
    }
  );

  static getPayments = asyncHandler(
    async (req: Request, res: Response) => {
      const payments = await PaymentService.getAdminPayments(req.query as any);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          "Admin payments fetched successfully",
          payments
        )
      );
    }
  );
}