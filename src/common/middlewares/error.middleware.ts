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
  } else if (err.name === "MulterError") {
    // Upload rejections are the user's fault, not a server fault — surface a
    // readable 400 instead of the generic 500 the raw MulterError produced.
    statusCode = HTTP_STATUS.BAD_REQUEST;
    if (err.code === "LIMIT_FILE_SIZE") {
      message = "That file is too large. The maximum upload size is 15 MB.";
    } else if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Too many files. You can attach up to 10 files to a post.";
    } else {
      message = `Upload failed: ${err.message}`;
    }
  } else if (err.code === 11000) {
    // Duplicate key — e.g. a second invitation for the same pair.
    statusCode = HTTP_STATUS.CONFLICT;
    message = "That record already exists.";
  }

  console.error(`[ErrorMiddleware] Path: ${req.path} | Status: ${statusCode} | Message: ${message}`, err);

  res.status(statusCode).json({
    success: false,
    message,
  });
};