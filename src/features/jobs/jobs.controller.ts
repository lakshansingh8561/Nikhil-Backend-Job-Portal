
import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { JobService } from "./jobs.service";
import { JOB_MESSAGES } from "./jobs.constants";

export class JobController {
  static createJob = asyncHandler(async (req: Request, res: Response) => {
    const job = await JobService.createJob(
      req.user.userId,
      req.body
    );

    res.status(HTTP_STATUS.CREATED).json(
      new ApiResponse(
        true,
        JOB_MESSAGES.JOB_CREATED,
        job
      )
    );
  });

  static getAllJobs = asyncHandler(async (req: Request, res: Response) => {
    const jobs = await JobService.getAllJobs(req.query);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        JOB_MESSAGES.JOBS_FETCHED,
        jobs
      )
    );
  });

  static getJobById = asyncHandler(async (req: Request, res: Response) => {
    const job = await JobService.getJobById(req.params.id as string);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        JOB_MESSAGES.JOB_FETCHED,
        job
      )
    );
  });

  static getMyJobs = asyncHandler(async (req: Request, res: Response) => {
    const jobs = await JobService.getRecruiterJobs(req.user.userId);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        JOB_MESSAGES.JOBS_FETCHED,
        jobs
      )
    );
  });

  static updateJob = asyncHandler(async (req: Request, res: Response) => {
    const job = await JobService.updateJob(
      req.user.userId,
      req.params.id as string,
      req.body
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        JOB_MESSAGES.JOB_UPDATED,
        job
      )
    );
  });

  static deleteJob = asyncHandler(async (req: Request, res: Response) => {
    await JobService.deleteJob(
      req.user.userId,
      req.params.id as string
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        JOB_MESSAGES.JOB_DELETED
      )
    );
  });
}