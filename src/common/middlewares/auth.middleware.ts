import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { User } from "../../database/models";
import { ApiError } from "../utils/ApiError";
import { HTTP_STATUS } from "../constants/httpStatus";
import { AUTH_MESSAGES } from "../../features/auth/auth.constants";
import { UserStatus } from "../enums";

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        AUTH_MESSAGES.UNAUTHORIZED
      );
    }

    const token = authHeader.split(" ")[1];

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.userId);

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        AUTH_MESSAGES.USER_NOT_FOUND
      );
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        AUTH_MESSAGES.USER_BLOCKED
      );
    }

    (req as any).user = {
      userId: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};