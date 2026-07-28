import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { RecruiterService } from "./recruiter.service";
import { RECRUITER_MESSAGES } from "./recruiter.constants";

export class RecruiterController {
  static createProfile = asyncHandler(async (req: Request, res: Response) => {
    const profile = await RecruiterService.createProfile(
      req.user.userId,
      req.body
    );

    res.status(HTTP_STATUS.CREATED).json(
      new ApiResponse(
        true,
        RECRUITER_MESSAGES.PROFILE_CREATED,
        profile
      )
    );
  });

  static getProfile = asyncHandler(async (req: Request, res: Response) => {
    const profile = await RecruiterService.getProfile(
      req.user.userId
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        RECRUITER_MESSAGES.PROFILE_FETCHED,
        profile
      )
    );
  });

  static updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const profile = await RecruiterService.updateProfile(
      req.user.userId,
      req.body
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        RECRUITER_MESSAGES.PROFILE_UPDATED,
        profile
      )
    );
  });
}