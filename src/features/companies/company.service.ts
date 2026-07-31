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

    let recruiterProfile = await RecruiterProfile.findOne({
      userId,
    });

    if (!recruiterProfile) {
      // Auto-create basic recruiter profile if not exists
      recruiterProfile = await RecruiterProfile.create({
        userId,
        firstName: user.email.split("@")[0],
        lastName: "Recruiter",
        phone: payload.phone || "0000000000",
        designation: "Recruiter",
      });
    }

    const existingCompany = await Company.findOne({
      ownerId: userId,
    });

    if (existingCompany) {
      // If already exists, update it instead of error
      Object.assign(existingCompany, payload);
      await existingCompany.save();
      return existingCompany;
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
    companyId: string | undefined,
    payload: UpdateCompanyInput
  ) {
    const filter: any = { ownerId: userId };
    if (companyId && companyId !== "my") {
      filter._id = companyId;
    }

    let company = await Company.findOne(filter);

    if (!company) {
      // Create new company if updating non-existent company
      company = await Company.create({
        ownerId: userId,
        ...payload,
      });

      const recruiterProfile = await RecruiterProfile.findOne({ userId });
      if (recruiterProfile) {
        recruiterProfile.companyId = company._id;
        await recruiterProfile.save();
      }

      return company;
    }

    Object.assign(company, payload);
    await company.save();

    return company;
  }
}