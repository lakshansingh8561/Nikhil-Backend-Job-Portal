import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AdminService } from "./admin.service";
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
    async (_req: Request, res: Response) => {
      const users = await AdminService.getAllUsers();

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          ADMIN_MESSAGES.USERS_FETCHED,
          users
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
    async (_req: Request, res: Response) => {
      const jobs = await AdminService.getAllJobs();

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          ADMIN_MESSAGES.JOBS_FETCHED,
          jobs
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
}