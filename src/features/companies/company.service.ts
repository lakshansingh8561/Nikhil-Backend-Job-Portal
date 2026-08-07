import { Company, CompanyMember, RecruiterProfile, User } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { COMPANY_MESSAGES } from "./company.constants";
import {
  CreateCompanyInput,
  UpdateCompanyInput,
} from "./company.types";

const generateSlug = (name: string) => {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s-]+/g, "-") + `-${Date.now().toString().slice(-4)}`
  );
};

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
      recruiterProfile = await RecruiterProfile.create({
        userId,
        designation: "Recruiter",
      });
    }

    // Check if user is already an OWNER or member of a company
    const existingMembership = await CompanyMember.findOne({ userId, role: "OWNER" });
    if (existingMembership) {
      const existingCompany = await Company.findById(existingMembership.companyId);
      if (existingCompany) {
        Object.assign(existingCompany, payload);
        if (payload.name) {
          existingCompany.slug = generateSlug(payload.name);
        }
        await existingCompany.save();
        return existingCompany;
      }
    }

    const companyName = (payload as any).name || (payload as any).companyName || "My Company";
    const slug = generateSlug(companyName);

    const company = await Company.create({
      name: companyName,
      slug,
      description: payload.description || "",
      industry: payload.industry || "Technology",
      companySize: payload.companySize || "1-10",
      email: payload.email || user.email,
      phone: payload.phone || "",
      website: payload.website || "",
      logo: payload.logo || "",
      coverImage: payload.coverImage || "",
      location: payload.location || {},
      socialLinks: payload.socialLinks || {},
      verificationStatus: "PENDING",
      status: "ACTIVE",
    });

    await CompanyMember.create({
      companyId: company._id,
      userId,
      role: "OWNER",
      joinedAt: new Date(),
    }).catch(() => null);

    recruiterProfile.companyId = company._id;
    await recruiterProfile.save();

    return company;
  }

  static async getMyCompany(userId: string) {
    const member = await CompanyMember.findOne({ userId });
    let company;

    if (member) {
      company = await Company.findById(member.companyId);
    }

    if (!company) {
      // Fallback: check via RecruiterProfile
      const recruiterProf = await RecruiterProfile.findOne({ userId });
      if (recruiterProf?.companyId) {
        company = await Company.findById(recruiterProf.companyId);
      }
    }

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
    let targetCompanyId = companyId;

    if (!targetCompanyId || targetCompanyId === "my") {
      const member = await CompanyMember.findOne({ userId });
      if (member) {
        targetCompanyId = member.companyId.toString();
      } else {
        const recruiterProf = await RecruiterProfile.findOne({ userId });
        if (recruiterProf?.companyId) {
          targetCompanyId = recruiterProf.companyId.toString();
        }
      }
    }

    let company = targetCompanyId ? await Company.findById(targetCompanyId) : null;

    if (!company) {
      return this.createCompany(userId, payload as CreateCompanyInput);
    }

    if (payload.name) {
      company.name = payload.name;
      company.slug = generateSlug(payload.name);
    }
    if ((payload as any).companyName && !payload.name) {
      company.name = (payload as any).companyName;
      company.slug = generateSlug((payload as any).companyName);
    }

    Object.assign(company, payload);
    await company.save();

    return company;
  }
}