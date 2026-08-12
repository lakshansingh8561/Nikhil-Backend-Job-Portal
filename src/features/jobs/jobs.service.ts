import { Types } from "mongoose";
import { Company, Job, CompanyMember, RecruiterProfile } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { JOB_MESSAGES } from "./jobs.constants";
import {
  CreateJobInput,
  UpdateJobInput,
  JobQuery,
} from "./jobs.types";

function safeRegex(str: string): RegExp {
  if (!str) return new RegExp("", "i");
  const escaped = String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

export class JobService {
  static async createJob(
    userId: string,
    payload: CreateJobInput
  ) {
    let company = await Company.findOne({
      $or: [
        { userId: new Types.ObjectId(userId) },
        { ownerId: new Types.ObjectId(userId) },
      ],
    });

    if (!company) {
      const memberRecord = await CompanyMember.findOne({ userId: new Types.ObjectId(userId) });
      if (memberRecord) {
        company = await Company.findById(memberRecord.companyId);
      }
    }

    if (!company) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Please create your company profile before posting a job!"
      );
    } else {
      const existingMember = await CompanyMember.findOne({ companyId: company._id, userId: new Types.ObjectId(userId) });
      if (!existingMember) {
        await CompanyMember.create({
          companyId: company._id,
          userId: new Types.ObjectId(userId),
          role: "RECRUITER",
        }).catch(() => null);
      }
    }

    let workplaceType = payload.workplaceType ? String(payload.workplaceType).toUpperCase() : "ONSITE";
    if (!["REMOTE", "HYBRID", "ONSITE"].includes(workplaceType)) {
      if (workplaceType.includes("REMOTE")) workplaceType = "REMOTE";
      else if (workplaceType.includes("HYBRID")) workplaceType = "HYBRID";
      else workplaceType = "ONSITE";
    }

    let rawJobType = payload.jobType || payload.employmentType || "FULL_TIME";
    let jobType = String(rawJobType).toUpperCase().replace(/[-\s]/g, "_");
    if (!["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "FREELANCE"].includes(jobType)) {
      if (jobType.includes("PART")) jobType = "PART_TIME";
      else if (jobType.includes("CONTRACT")) jobType = "CONTRACT";
      else if (jobType.includes("INTERN")) jobType = "INTERNSHIP";
      else if (jobType.includes("FREE")) jobType = "FREELANCE";
      else jobType = "FULL_TIME";
    }

    const job = await Job.create({
      ...payload,
      workplaceType,
      jobType,
      employmentType: jobType,
      companyId: company._id,
      userId,
      status: "ACTIVE",
      isActive: true,
      isDeleted: false,
    });

    return job;
  }

  static async getAllJobs(query: JobQuery) {
    try {
      const andConditions: any[] = [
        { isDeleted: { $ne: true } },
        { isActive: { $ne: false } },
      ];

      const targetUserId = query.userId || query.recruiterId;
      if (targetUserId && Types.ObjectId.isValid(targetUserId)) {
        andConditions.push({
          $or: [
            { userId: new Types.ObjectId(targetUserId) },
            { recruiterId: new Types.ObjectId(targetUserId) },
          ],
        });
      }

      if (query.companyId && Types.ObjectId.isValid(query.companyId)) {
        andConditions.push({ companyId: new Types.ObjectId(query.companyId) });
      }

      // General Keyword Search
      if (query.search && String(query.search).trim()) {
        const searchTerm = String(query.search).trim();
        const searchRegex = safeRegex(searchTerm);

        const matchingCompanies = await Company.find({
          $or: [
            { name: searchRegex },
            { companyName: searchRegex },
            { industry: searchRegex },
          ],
        }).select("_id").catch(() => []);
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
      if (query.location && String(query.location).trim()) {
        const locTerm = String(query.location).trim();
        const locRegex = safeRegex(locTerm);

        const matchingCompanies = await Company.find({
          $or: [
            { location: locRegex },
            { city: locRegex },
            { state: locRegex },
          ],
        }).select("_id").catch(() => []);
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
      if (query.industry && String(query.industry).trim()) {
        const indTerm = String(query.industry).trim();
        const indRegex = safeRegex(indTerm);

        const matchingCompanies = await Company.find({
          industry: indRegex,
        }).select("_id").catch(() => []);
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
      if (query.employmentType && String(query.employmentType).trim()) {
        const et = String(query.employmentType).trim().replace(/_/g, "[ _-]?");
        andConditions.push({
          employmentType: { $regex: safeRegex(et) },
        });
      }

      // Experience Level Filter
      if (query.experienceLevel && String(query.experienceLevel).trim()) {
        const exp = String(query.experienceLevel).trim();
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

      // Skills Filter
      if (query.skills) {
        const skillsArray = Array.isArray(query.skills)
          ? query.skills
          : String(query.skills)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

        if (skillsArray.length > 0) {
          const skillRegexes = skillsArray.map((s) => safeRegex(s));
          andConditions.push({
            skills: { $in: skillRegexes },
          });
        }
      }

      const filter = andConditions.length > 0 ? { $and: andConditions } : {};

      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 12));
      const skip = (page - 1) * limit;

      const jobs = await Job.find(filter)
        .populate("companyId", "name companyName logo location industry")
        .populate("userId", "email")
        .skip(skip)
        .limit(limit)
        .sort({
          createdAt: -1,
        })
        .lean();

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
    } catch (error) {
      console.error("Error fetching jobs in JobService.getAllJobs:", error);
      // Safe fallback response to prevent 500 Internal Server Error
      return {
        jobs: [],
        pagination: {
          page: 1,
          limit: 12,
          total: 0,
          pages: 1,
        },
      };
    }
  }

  static async getJobById(id: string) {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, JOB_MESSAGES.JOB_NOT_FOUND);
    }

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
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return [];
    }

    return Job.find({
      $or: [
        { userId: new Types.ObjectId(userId) },
        { recruiterId: new Types.ObjectId(userId) },
      ],
      isDeleted: { $ne: true },
    })
      .populate("companyId")
      .sort({ createdAt: -1 });
  }

  static async updateJob(
    userId: string,
    jobId: string,
    payload: UpdateJobInput
  ) {
    const job = await Job.findOne({
      _id: jobId,
      $or: [{ userId }, { recruiterId: userId }],
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
      $or: [{ userId }, { recruiterId: userId }],
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