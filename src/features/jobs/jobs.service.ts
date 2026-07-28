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

    if (query.search) {
      filter.$text = {
        $search: query.search,
      };
    }

    if (query.location) {
      filter.location = query.location;
    }

    if (query.employmentType) {
      filter.employmentType = query.employmentType;
    }

    if (query.experienceLevel) {
      filter.experienceLevel = query.experienceLevel;
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