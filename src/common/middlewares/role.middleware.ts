import { NextFunction, Request, Response } from "express";
import { Role } from "../enums";
import { ApiError } from "../utils/ApiError";
import { HTTP_STATUS } from "../constants/httpStatus";
import { AUTH_MESSAGES } from "../../features/auth/auth.constants";

export const authorize = (...roles: Role[]) => {
  return (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        AUTH_MESSAGES.UNAUTHORIZED
      );
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        "You do not have permission to access this resource."
      );
    }

    next();
  };
};