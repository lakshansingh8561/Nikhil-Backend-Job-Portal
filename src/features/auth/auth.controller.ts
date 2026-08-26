import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AUTH_MESSAGES } from "./auth.constants";

export class AuthController {
  static googleAuth = asyncHandler(async (req: Request, res: Response) => {
    const { credential, role } = req.body;
    const data = await AuthService.googleAuth(credential, role);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        "Google Authentication successful.",
        data
      )
    );
  });

  static sendOtp = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    const result = await AuthService.sendRegistrationOtp(email);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        result.message,
        null
      )
    );
  });

  static verifyOtp = asyncHandler(async (req: Request, res: Response) => {
    const data = await AuthService.verifyOtpAndRegister(req.body);

    res.status(HTTP_STATUS.CREATED).json(
      new ApiResponse(
        true,
        AUTH_MESSAGES.REGISTER_SUCCESS,
        data
      )
    );
  });

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
  });

  static changePassword = asyncHandler(async (req: Request, res: Response) => {
    const data = await AuthService.changePassword(req.user.userId, req.body);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        "Password updated successfully.",
        data
      )
    );
  });

  static sendForgotPasswordOtp = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    const result = await AuthService.sendForgotPasswordOtp(email);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        result.message,
        null
      )
    );
  });

  static resetPasswordWithOtp = asyncHandler(async (req: Request, res: Response) => {
    const result = await AuthService.resetPasswordWithOtp(req.body);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        result.message,
        null
      )
    );
  });
}