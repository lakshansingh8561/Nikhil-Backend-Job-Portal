import { Request, Response } from "express";

import { HTTP_STATUS } from "../constants/httpStatus";

import { MESSAGES } from "../constants/message";

export const notFoundMiddleware = (
  req: Request,
  res: Response
) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: MESSAGES.ROUTE_NOT_FOUND,
  });
};