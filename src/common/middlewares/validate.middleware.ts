import { NextFunction, Request, Response } from "express";
import { ZodSchema, ZodError } from "zod";
import { ApiError } from "../utils/ApiError";
import { HTTP_STATUS } from "../constants/httpStatus";

export const validate =
  (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`).join(", ");
        return next(new ApiError(HTTP_STATUS.BAD_REQUEST, `Validation Error: ${issues}`));
      }
      next(err);
    }
  };