import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { JobSeekerService } from "./jobSeeker.service";
import { JOB_SEEKER_MESSAGES } from "./jobSeeker.constants";

export class JobSeekerController {
  /**
   * Create Profile
   */
  static createProfile = asyncHandler(async (req: Request, res: Response) => {
    const profile = await JobSeekerService.createProfile(
      req.user.userId,
      req.body
    );

    res.status(HTTP_STATUS.CREATED).json(
      new ApiResponse(
        true,
        JOB_SEEKER_MESSAGES.PROFILE_CREATED,
        profile
      )
    );
  });

  /**
   * Get My Profile
   */
  static getProfile = asyncHandler(async (req: Request, res: Response) => {
    const profile = await JobSeekerService.getProfile(
      req.user.userId
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        JOB_SEEKER_MESSAGES.PROFILE_FETCHED,
        profile
      )
    );
  });

  /**
   * Get All Candidate Profiles (Paginated)
   */
  static getAllProfiles = asyncHandler(async (req: Request, res: Response) => {
    const data = await JobSeekerService.getAllProfiles(req.query as any);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        JOB_SEEKER_MESSAGES.PROFILES_FETCHED,
        data
      )
    );
  });

  /**
   * Get Profile By ID
   */
  static getProfileById = asyncHandler(async (req: Request, res: Response) => {
    const profileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const profile = await JobSeekerService.getProfileById(profileId);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        JOB_SEEKER_MESSAGES.PROFILE_FETCHED,
        profile
      )
    );
  });

  /**
   * Update Profile
   */
  static updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const profile = await JobSeekerService.updateProfile(
      req.user.userId,
      req.body
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        JOB_SEEKER_MESSAGES.PROFILE_UPDATED,
        profile
      )
    );
  });
}