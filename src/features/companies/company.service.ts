import { Types } from "mongoose";
import { Company, CompanyMember, RecruiterProfile, User, Job } from "../../database/models";
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
  static async getTopCompanies(limit = 20) {
    const dbCompanies = await Company.find({ status: "ACTIVE", isDeleted: false })
      .limit(limit)
      .sort({ createdAt: -1 });

    const formattedCompanies = await Promise.all(
      dbCompanies.map(async (company) => {
        const openJobsCount = await Job.countDocuments({
          companyId: company._id,
          isActive: true,
        });

        const locationStr =
          typeof company.location === "string" && company.location
            ? company.location
            : company.location?.city
            ? `${company.location.city}${company.location.country ? `, ${company.location.country}` : ""}`
            : "Location Not Specified";

        return {
          _id: company._id.toString(),
          name: company.name,
          slug: company.slug,
          logo: company.logo || "",
          industry: company.industry || "Technology",
          location: locationStr,
          openJobsCount,
          rating: 4.8,
          reviewsCount: 12,
        };
      })
    );

    const recruiterProfiles = await RecruiterProfile.find()
      .populate("userId", "email role")
      .populate("companyId")
      .limit(limit)
      .sort({ createdAt: -1 });

    const recruiterItems = await Promise.all(
      recruiterProfiles.map(async (rec) => {
        const recUserId = typeof rec.userId === "object" && rec.userId !== null ? (rec.userId as any)._id : rec.userId;
        const openJobsCount = await Job.countDocuments({
          userId: recUserId,
          isActive: true,
        });

        const companyObj = typeof rec.companyId === "object" && rec.companyId !== null ? (rec.companyId as any) : null;
        const name = companyObj?.name || rec.currentCompany || `${rec.firstName || ""} ${rec.lastName || ""}`.trim() || "Recruiter";
        const logo = companyObj?.logo || rec.companyLogo || rec.profilePicture || "";
        const locationStr = companyObj?.location?.city
          ? `${companyObj.location.city}${companyObj.location.country ? `, ${companyObj.location.country}` : ""}`
          : rec.currentLocation || "Location Not Specified";

        return {
          _id: rec._id.toString(),
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
          logo,
          industry: rec.designation || "Recruitment",
          location: locationStr,
          openJobsCount,
          rating: 4.8,
          reviewsCount: 10,
        };
      })
    );

    const results: any[] = [];
    const seenNames = new Set<string>();

    for (const item of [...formattedCompanies, ...recruiterItems]) {
      const nameKey = item.name.trim().toLowerCase();
      if (!nameKey) continue;
      if (!seenNames.has(nameKey)) {
        seenNames.add(nameKey);
        results.push(item);
      }
    }

    return results.slice(0, limit);
  }
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
      companyName: companyName,
      slug,
      userId: new Types.ObjectId(userId),
      ownerId: new Types.ObjectId(userId),
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
      verificationStatus: "APPROVED",
      status: "ACTIVE",
    } as any);

    await CompanyMember.create({
      companyId: company._id,
      userId,
      role: "OWNER",
      joinedAt: new Date(),
    }).catch(() => null);

    recruiterProfile.companyId = company._id;
    recruiterProfile.currentCompany = company.name;
    await recruiterProfile.save();

    return company;
  }

  static async getMyCompany(userId: string) {
    // 1. Prioritize direct ownership by userId / ownerId
    let company = await Company.findOne({
      $or: [
        { userId: new Types.ObjectId(userId) },
        { ownerId: new Types.ObjectId(userId) },
      ],
    });

    // 2. Check via RecruiterProfile
    if (!company) {
      const recruiterProf = await RecruiterProfile.findOne({ userId });
      if (recruiterProf?.companyId) {
        company = await Company.findById(recruiterProf.companyId);
      }
    }

    // 3. Check via CompanyMember
    if (!company) {
      const member = await CompanyMember.findOne({ userId: new Types.ObjectId(userId) });
      if (member) {
        const comp = await Company.findById(member.companyId);
        if (comp && (comp.ownerId?.toString() === userId || comp.userId?.toString() === userId)) {
          company = comp;
        }
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
      let comp = await Company.findOne({
        $or: [
          { userId: new Types.ObjectId(userId) },
          { ownerId: new Types.ObjectId(userId) },
        ],
      });
      if (comp) {
        targetCompanyId = comp._id.toString();
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

    const recruiterProf = await RecruiterProfile.findOne({ userId });
    if (recruiterProf) {
      recruiterProf.companyId = company._id;
      recruiterProf.currentCompany = company.name;
      await recruiterProf.save();
    }

    return company;
  }
}