import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { CompanyService } from "./company.service";
import { COMPANY_MESSAGES } from "./company.constants";

export class CompanyController {
  static createCompany = asyncHandler(async (req: Request, res: Response) => {
    const company = await CompanyService.createCompany(
      req.user.userId,
      req.body
    );

    res.status(HTTP_STATUS.CREATED).json(
      new ApiResponse(
        true,
        COMPANY_MESSAGES.COMPANY_CREATED,
        company
      )
    );
  });

  static getMyCompany = asyncHandler(async (req: Request, res: Response) => {
    const company = await CompanyService.getMyCompany(
      req.user.userId
    );

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        COMPANY_MESSAGES.COMPANY_FETCHED,
        company
      )
    );
  });

  static updateCompany = asyncHandler(async (req: Request, res: Response) => {
 const company = await CompanyService.updateCompany(
  req.user.userId,
  req.params.id as string,
  req.body
);

    res.status(HTTP_STATUS.OK).json(
      new ApiResponse(
        true,
        COMPANY_MESSAGES.COMPANY_UPDATED,
        company
      )
    );
  });
}