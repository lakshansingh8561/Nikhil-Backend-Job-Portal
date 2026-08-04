import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { ApplicationService } from "./application.service";
import { APPLICATION_MESSAGES } from "./application.constants";

export class ApplicationController {
  static applyJob = asyncHandler(
    async (req: Request, res: Response) => {
      const application = await ApplicationService.applyJob(
        req.user.userId,
        req.params.jobId as string,
        req.body
      );

      res.status(HTTP_STATUS.CREATED).json(
        new ApiResponse(
          true,
          APPLICATION_MESSAGES.APPLIED_SUCCESSFULLY,
          application
        )
      );
    }
  );

  static getMyApplications = asyncHandler(
    async (req: Request, res: Response) => {
      const applications =
        await ApplicationService.getMyApplications(
          req.user.userId
        );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          APPLICATION_MESSAGES.APPLICATIONS_FETCHED,
          applications
        )
      );
    }
  );

  static getRecruiterAllApplications = asyncHandler(
    async (req: Request, res: Response) => {
      const applications =
        await ApplicationService.getRecruiterAllApplications(
          req.user.userId
        );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          APPLICATION_MESSAGES.APPLICATIONS_FETCHED,
          applications
        )
      );
    }
  );

  static getApplicationsForJob = asyncHandler(
    async (req: Request, res: Response) => {
      const applications =
        await ApplicationService.getApplicationsForJob(
          req.user.userId,
          req.params.jobId as string
        );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          APPLICATION_MESSAGES.APPLICATIONS_FETCHED,
          applications
        )
      );
    }
  );

  static updateStatus = asyncHandler(
    async (req: Request, res: Response) => {
      const application =
        await ApplicationService.updateStatus(
          req.user.userId,
          req.params.id as string,
          req.body
        );

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          true,
          APPLICATION_MESSAGES.APPLICATION_STATUS_UPDATED,
          application
        )
      );
    }
  );
}