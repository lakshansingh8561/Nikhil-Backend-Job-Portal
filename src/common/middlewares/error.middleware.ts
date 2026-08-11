import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";
import { HTTP_STATUS } from "../constants/httpStatus";
import { MESSAGES } from "../constants/message";

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = err instanceof ApiError ? err.statusCode : HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = err.message || MESSAGES.INTERNAL_SERVER_ERROR;

  // Format Mongoose ValidationError to 400 Bad Request
  if (err.name === "ValidationError" && err.errors) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = Object.values(err.errors).map((e: any) => e.message).join(". ");
  } else if (err.name === "CastError") {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = `Invalid ID parameter format for ${err.path}: ${err.value}`;
  }

  console.error(`[ErrorMiddleware] Path: ${req.path} | Status: ${statusCode} | Message: ${message}`, err);

  res.status(statusCode).json({
    success: false,
    message,
  });
};