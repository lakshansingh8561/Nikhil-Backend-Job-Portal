import { Company, RecruiterProfile, User } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { COMPANY_MESSAGES } from "./company.constants";
import {
  CreateCompanyInput,
  UpdateCompanyInput,
} from "./company.types";

export class CompanyService {
  static async createCompany(
    userId: string,
    payload: CreateCompanyInput
  ) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        "User not found."
      );
    }

    if (user.role !== Role.RECRUITER) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        "Only recruiters can create companies."
      );
    }

    const recruiterProfile = await RecruiterProfile.findOne({
      userId,
    });

    if (!recruiterProfile) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Please create your recruiter profile first."
      );
    }

    const existingCompany = await Company.findOne({
      ownerId: userId,
    });

    if (existingCompany) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        COMPANY_MESSAGES.COMPANY_ALREADY_EXISTS
      );
    }

    const companyNameExists = await Company.findOne({
      companyName: payload.companyName,
    });

    if (companyNameExists) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        "Company name already exists."
      );
    }

    const company = await Company.create({
      ownerId: userId,
      ...payload,
    });

    recruiterProfile.companyId = company._id;
    await recruiterProfile.save();

    return company;
  }

  static async getMyCompany(userId: string) {
    const company = await Company.findOne({
      ownerId: userId,
    }).populate("ownerId", "email role");

    if (!company) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        COMPANY_MESSAGES.COMPANY_NOT_FOUND
      );
    }

    return company;
  }

  static async updateCompany(
    userId: string,
    companyId: string,
    payload: UpdateCompanyInput
  ) {
    const company = await Company.findOne({
      _id: companyId,
      ownerId: userId,
    });

    if (!company) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        COMPANY_MESSAGES.COMPANY_NOT_FOUND
      );
    }

    Object.assign(company, payload);

    await company.save();

    return company;
  }
}