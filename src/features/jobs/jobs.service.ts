import { Company, Job, CompanyMember, RecruiterProfile } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { JOB_MESSAGES } from "./jobs.constants";
import {
  CreateJobInput,
  UpdateJobInput,
  JobQuery,
} from "./jobs.types";

export class JobService {
  static async createJob(
    userId: string,
    payload: CreateJobInput
  ) {
    let company = await Company.findOne({ userId });

    if (!company) {
      const memberRecord = await CompanyMember.findOne({ userId });
      if (memberRecord) {
        company = await Company.findById(memberRecord.companyId);
      }
    }

    if (!company) {
      const recruiterProfile = await RecruiterProfile.findOne({ userId }).catch(() => null);
      const compName = recruiterProfile?.currentCompany?.trim() || "Innovate Tech Solutions";

      company = await Company.create({
        name: compName,
        companyName: compName,
        slug: `company-${userId.slice(-6)}-${Date.now()}`,
        userId,
        industry: "Information Technology",
        companySize: "1-10",
        verificationStatus: "APPROVED",
        isVerified: true,
      });

      await CompanyMember.create({
        companyId: company._id,
        userId,
        role: "OWNER",
      }).catch(() => null);
    } else {
      // Ensure company membership record exists for this recruiter
      const existingMember = await CompanyMember.findOne({ companyId: company._id, userId });
      if (!existingMember) {
        await CompanyMember.create({
          companyId: company._id,
          userId,
          role: "RECRUITER",
        }).catch(() => null);
      }
    }

    const job = await Job.create({
      ...payload,
      companyId: company._id,
      userId,
      status: "ACTIVE",
      isActive: true,
      isDeleted: false,
    });

    return job;
  }

  static async getAllJobs(query: JobQuery) {
    const andConditions: any[] = [
      { isDeleted: { $ne: true } },
      { isActive: { $ne: false } },
    ];

    const targetUserId = query.userId || query.recruiterId;
    if (targetUserId) {
      andConditions.push({ userId: targetUserId });
    }

    if (query.companyId) {
      andConditions.push({ companyId: query.companyId });
    }

    // General Keyword Search
    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchRegex = new RegExp(searchTerm, "i");

      const matchingCompanies = await Company.find({
        $or: [
          { name: searchRegex },
          { companyName: searchRegex },
          { industry: searchRegex },
        ],
      }).select("_id");
      const companyIds = matchingCompanies.map((c) => c._id);

      const searchOr: any[] = [
        { title: searchRegex },
        { description: searchRegex },
        { location: searchRegex },
        { skills: { $in: [searchRegex] } },
      ];

      if (companyIds.length > 0) {
        searchOr.push({ companyId: { $in: companyIds } });
      }

      andConditions.push({ $or: searchOr });
    }

    // Location Filter
    if (query.location && query.location.trim()) {
      const locTerm = query.location.trim();
      const locRegex = new RegExp(locTerm, "i");

      const matchingCompanies = await Company.find({
        $or: [
          { location: locRegex },
          { city: locRegex },
          { state: locRegex },
        ],
      }).select("_id");
      const companyIds = matchingCompanies.map((c) => c._id);

      const locationOr: any[] = [
        { location: locRegex },
        { "location.city": locRegex },
        { "location.state": locRegex },
      ];

      if (companyIds.length > 0) {
        locationOr.push({ companyId: { $in: companyIds } });
      }

      andConditions.push({ $or: locationOr });
    }

    // Industry Filter
    if (query.industry && query.industry.trim()) {
      const indTerm = query.industry.trim();
      const indRegex = new RegExp(indTerm, "i");

      const matchingCompanies = await Company.find({
        industry: indRegex,
      }).select("_id");
      const companyIds = matchingCompanies.map((c) => c._id);

      const industryOr: any[] = [
        { title: indRegex },
        { description: indRegex },
        { skills: { $in: [indRegex] } },
      ];

      if (companyIds.length > 0) {
        industryOr.push({ companyId: { $in: companyIds } });
      }

      andConditions.push({ $or: industryOr });
    }

    // Employment Type Filter
    if (query.employmentType && query.employmentType.trim()) {
      const et = query.employmentType.trim().replace(/_/g, "[ _-]?");
      andConditions.push({
        employmentType: { $regex: new RegExp(et, "i") },
      });
    }

    // Experience Level Filter
    if (query.experienceLevel && query.experienceLevel.trim()) {
      const exp = query.experienceLevel.trim();
      let expRegexStr = exp;
      if (exp === "FRESHER" || exp === "ENTRY" || exp === "Internship" || exp === "Entry Level") {
        expRegexStr = "fresher|entry|intern|0-1|1-2";
      } else if (exp === "ONE_TO_TWO" || exp === "1-2 Years") {
        expRegexStr = "1-2|1 - 2|one|entry|mid";
      } else if (exp === "THREE_TO_FIVE" || exp === "3-5 Years") {
        expRegexStr = "3-5|3 - 5|three|mid";
      } else if (exp === "FIVE_PLUS" || exp === "5+ Years") {
        expRegexStr = "5\\+|5 -|senior|executive";
      }
      andConditions.push({
        experienceLevel: { $regex: new RegExp(expRegexStr, "i") },
      });
    }

    // Salary Min Filter
    if (query.salaryMin && Number(query.salaryMin) > 0) {
      const sMin = Number(query.salaryMin);
      andConditions.push({
        $or: [
          { salaryMax: { $gte: sMin } },
          { salaryMin: { $gte: sMin } },
        ],
      });
    }

    // Salary Max Filter
    if (query.salaryMax && Number(query.salaryMax) > 0) {
      const sMax = Number(query.salaryMax);
      andConditions.push({
        $or: [
          { salaryMin: { $lte: sMax } },
          { salaryMax: { $lte: sMax } },
        ],
      });
    }

    // Skills Filter (Can be string or array)
    if (query.skills) {
      const skillsArray = Array.isArray(query.skills)
        ? query.skills
        : String(query.skills)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      if (skillsArray.length > 0) {
        const skillRegexes = skillsArray.map((s) => new RegExp(s, "i"));
        andConditions.push({
          skills: { $in: skillRegexes },
        });
      }
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 12;
    const skip = (page - 1) * limit;

    const jobs = await Job.find(filter)
      .populate("companyId", "name companyName logo location industry")
      .populate("userId", "email")
      .skip(skip)
      .limit(limit)
      .sort({
        createdAt: -1,
      });

    const total = await Job.countDocuments(filter);

    return {
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  static async getJobById(id: string) {
    const job = await Job.findById(id)
      .populate("companyId")
      .populate("userId", "email");

    if (!job) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        JOB_MESSAGES.JOB_NOT_FOUND
      );
    }

    return job;
  }

  static async getRecruiterJobs(userId: string) {
    return Job.find({ userId, isDeleted: { $ne: true } }).sort({
      createdAt: -1,
    });
  }

  static async updateJob(
    userId: string,
    jobId: string,
    payload: UpdateJobInput
  ) {
    const job = await Job.findOne({
      _id: jobId,
      userId,
    });

    if (!job) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        JOB_MESSAGES.JOB_NOT_FOUND
      );
    }

    Object.assign(job, payload);
    await job.save();

    return job;
  }

  static async deleteJob(
    userId: string,
    jobId: string
  ) {
    const job = await Job.findOne({
      _id: jobId,
      userId,
    });

    if (!job) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        JOB_MESSAGES.JOB_NOT_FOUND
      );
    }

    await job.deleteOne();
    return;
  }
}