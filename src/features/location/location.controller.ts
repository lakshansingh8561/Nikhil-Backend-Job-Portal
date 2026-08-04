import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { LocationService } from "./location.service";

export class LocationController {
  /**
   * POST /api/v1/location/update
   */
  static updateLocation = asyncHandler(async (req: Request, res: Response) => {
    const result = await LocationService.updateUserLocation(
      req.user.userId,
      req.body
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, "Location updated successfully.", result)
    );
  });

  /**
   * GET /api/v1/location/me
   */
  static getLocation = asyncHandler(async (req: Request, res: Response) => {
    const location = await LocationService.getUserLocation(req.user.userId);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(true, "Location retrieved successfully.", location)
    );
  });
}
