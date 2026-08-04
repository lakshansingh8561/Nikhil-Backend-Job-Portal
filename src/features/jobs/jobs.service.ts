import { Company, Job } from "../../database/models";
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
    const company = await Company.findOne({
      ownerId: userId,
    });

    if (!company) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        JOB_MESSAGES.COMPANY_REQUIRED
      );
    }

    const job = await Job.create({
      ...payload,
      companyId: company._id,
      recruiterId: userId,
    });

    return job;
  }

  static async getAllJobs(query: JobQuery) {
    const filter: any = {
      isActive: true,
    };

    if (query.recruiterId) {
      filter.recruiterId = query.recruiterId;
    }

    if (query.companyId) {
      filter.companyId = query.companyId;
    }

    if (query.search) {
      const matchingCompanies = await Company.find({
        companyName: { $regex: query.search, $options: "i" },
      }).select("_id");
      const companyIds = matchingCompanies.map((c) => c._id);

      filter.$or = [
        { title: { $regex: query.search, $options: "i" } },
        { description: { $regex: query.search, $options: "i" } },
        { skills: { $in: [new RegExp(query.search, "i")] } },
      ];

      if (companyIds.length > 0) {
        filter.$or.push({ companyId: { $in: companyIds } });
      }
    }

    if (query.location) {
      filter.location = { $regex: query.location, $options: "i" };
    }

    if (query.employmentType) {
      filter.employmentType = query.employmentType;
    }

    if (query.experienceLevel) {
      filter.experienceLevel = query.experienceLevel;
    }

    if (query.salaryMin) {
      filter.salaryMin = { $gte: Number(query.salaryMin) };
    }

    if (query.salaryMax) {
      filter.salaryMax = { $lte: Number(query.salaryMax) };
    }

    if (query.skills) {
      const skillsArr = Array.isArray(query.skills)
        ? query.skills
        : [query.skills];
      filter.skills = {
        $in: skillsArr.map((s) => new RegExp(s, "i")),
      };
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const skip = (page - 1) * limit;

    const jobs = await Job.find(filter)
      .populate("companyId", "companyName logo")
      .populate("recruiterId", "email")
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
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async getJobById(id: string) {
    const job = await Job.findById(id)
      .populate("companyId")
      .populate("recruiterId", "email");

    if (!job) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        JOB_MESSAGES.JOB_NOT_FOUND
      );
    }

    return job;
  }

  static async getRecruiterJobs(userId: string) {
    return Job.find({
      recruiterId: userId,
    }).sort({
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
      recruiterId: userId,
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
      recruiterId: userId,
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