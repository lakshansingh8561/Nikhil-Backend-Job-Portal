import { Request, Response } from "express";
import { NotificationService } from "./notification.service";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";

export class NotificationController {
  static getNotifications = asyncHandler(async (req: Request, res: Response) => {
    const data = await NotificationService.getUserNotifications(req.user.userId);
    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Notifications fetched successfully.", data));
  });

  static markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = await NotificationService.markAsRead(id, req.user.userId);
    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Notification marked as read.", data));
  });

  static markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
    const data = await NotificationService.markAllAsRead(req.user.userId);
    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "All notifications marked as read.", data));
  });
}
