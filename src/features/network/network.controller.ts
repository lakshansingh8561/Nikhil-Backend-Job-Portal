import { Request, Response } from "express";
import { NetworkService } from "./network.service";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums/role.enum";
import { ConnectionStatus } from "../../common/enums/connectionStatus.enum";

const getUserIdFromReq = (req: Request): string => {
  const user = (req as any).user;
  return String(user?.userId || user?.id || user?._id || "");
};

const getUserRoleFromReq = (req: Request): Role => (req as any).user?.role as Role;

const parsePage = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class NetworkController {
  // --- Directory & profiles --------------------------------------------------

  static searchDirectory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.searchDirectory(
      req.query.query ? String(req.query.query) : undefined,
      req.query.role ? String(req.query.role) : undefined,
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 12),
      getUserIdFromReq(req)
    );

    res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(true, "Professional directory fetched successfully.", result));
  });

  static getPublicProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.getPublicProfile(
      req.params.userId as string,
      getUserIdFromReq(req)
    );

    res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(true, "User public profile fetched successfully.", result));
  });

  static getMyProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromReq(req);
    const result = await NetworkService.getPublicProfile(userId, userId);

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Your profile fetched.", result));
  });

  static updateMyProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.updateMyProfile(
      getUserIdFromReq(req),
      getUserRoleFromReq(req),
      req.body
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Profile updated.", result));
  });

  // --- Invitations ----------------------------------------------------------

  static sendInvite = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.sendInvite(
      getUserIdFromReq(req),
      req.body?.recipientId,
      req.body?.message
    );

    // A pending invite in the opposite direction is accepted instead of duplicated,
    // so the two members connect immediately — say so rather than "Invitation sent."
    const message =
      result?.status === ConnectionStatus.ACCEPTED
        ? "You are now connected."
        : "Invitation sent.";

    res.status(HTTP_STATUS.CREATED).json(new ApiResponse(true, message, result));
  });

  static acceptInvite = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.acceptInvite(
      getUserIdFromReq(req),
      req.params.connectionId as string
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Invitation accepted.", result));
  });

  static ignoreInvite = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.ignoreInvite(
      getUserIdFromReq(req),
      req.params.connectionId as string
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Invitation ignored.", result));
  });

  static withdrawInvite = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.withdrawInvite(
      getUserIdFromReq(req),
      req.params.connectionId as string
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Invitation withdrawn.", result));
  });

  static getReceivedInvites = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.getReceivedInvites(
      getUserIdFromReq(req),
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 12)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Invitations fetched.", result));
  });

  static getSentInvites = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.getSentInvites(
      getUserIdFromReq(req),
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 12)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Sent invitations fetched.", result));
  });

  // --- Connections ----------------------------------------------------------

  static getConnections = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.getConnections(
      getUserIdFromReq(req),
      req.query.query ? String(req.query.query) : undefined,
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 12)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Connections fetched.", result));
  });

  static removeConnection = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.removeConnection(
      getUserIdFromReq(req),
      req.params.userId as string
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Connection removed.", result));
  });

  static getSuggestions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.getSuggestions(
      getUserIdFromReq(req),
      parsePage(req.query.limit, 8)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Suggestions fetched.", result));
  });

  static getNetworkStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.getNetworkStats(getUserIdFromReq(req));

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Network stats fetched.", result));
  });

  // --- Follows --------------------------------------------------------------

  static followUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.followUser(
      getUserIdFromReq(req),
      req.params.userId as string
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Following.", result));
  });

  static unfollowUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.unfollowUser(
      getUserIdFromReq(req),
      req.params.userId as string
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Unfollowed.", result));
  });

  static getFollowers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.getFollowers(
      req.params.userId as string,
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 12)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Followers fetched.", result));
  });

  static getFollowing = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await NetworkService.getFollowing(
      req.params.userId as string,
      parsePage(req.query.page, 1),
      parsePage(req.query.limit, 12)
    );

    res.status(HTTP_STATUS.OK).json(new ApiResponse(true, "Following list fetched.", result));
  });
}
