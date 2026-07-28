import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AUTH_MESSAGES } from "./auth.constants";

export class AuthController {
  static register = asyncHandler(async (req: Request, res: Response) => {
    const data = await AuthService.register(req.body);

    res.status(HTTP_STATUS.CREATED).json(
      new ApiResponse(
        true,
        AUTH_MESSAGES.REGISTER_SUCCESS,
        data
      )
    );
  });

  static login = asyncHandler(async (req: Request, res: Response) => {
    const data = await AuthService.login(req.body);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        AUTH_MESSAGES.LOGIN_SUCCESS,
        data
      )
    );
  });

  static logout = asyncHandler(async (req: Request, res: Response) => {
    await AuthService.logout(req.user.userId);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        AUTH_MESSAGES.LOGOUT_SUCCESS
      )
    );
  });

  static me = asyncHandler(async (req: Request, res: Response) => {
    const data = await AuthService.getCurrentUser(req.user.userId);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        "User fetched successfully.",
        data
      )
    );
  });

  static refreshToken = asyncHandler(
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    const data =
      await AuthService.refreshToken(refreshToken);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        AUTH_MESSAGES.REFRESH_TOKEN_SUCCESS,
        data
      )
    );
  }
);
}