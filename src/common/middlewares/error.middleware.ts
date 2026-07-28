import { Request, Response, NextFunction } from "express";

import { ApiError } from "../utils/ApiError";
import { HTTP_STATUS } from "../constants/httpStatus";
import { MESSAGES } from "../constants/message";

export const errorMiddleware = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode =
    err instanceof ApiError
      ? err.statusCode
      : HTTP_STATUS.INTERNAL_SERVER_ERROR;

  res.status(statusCode).json({
    success: false,
    message: err.message || MESSAGES.INTERNAL_SERVER_ERROR,
  });
};