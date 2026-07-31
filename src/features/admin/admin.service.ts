import {
  User,
  Job,
  Application,
  Company,
} from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { UserStatus } from "../../common/enums/userStatus.enum";
import { ADMIN_MESSAGES } from "./admin.constants";

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  employmentType?: string;
}

export class AdminService {
  static async getDashboardStats() {
    const [
      totalUsers,
      totalRecruiters,
      totalJobSeekers,
      totalCompanies,
      totalJobs,
      totalApplications,
      recentUsers,
      recentRecruiters,
      recentJobs,
      recentApplications,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: Role.RECRUITER }),
      User.countDocuments({ role: Role.JOB_SEEKER }),
      Company.countDocuments(),
      Job.countDocuments(),
      Application.countDocuments(),
      User.find()
        .select("-password -refreshToken")
        .sort({ createdAt: -1 })
        .limit(5),
      User.find({ role: Role.RECRUITER })
        .select("-password -refreshToken")
        .sort({ createdAt: -1 })
        .limit(5),
      Job.find()
        .populate("companyId", "companyName logo")
        .populate("recruiterId", "email")
        .sort({ createdAt: -1 })
        .limit(5),
      Application.find()
        .populate("applicantId")
        .populate({
          path: "jobId",
          populate: {
            path: "companyId",
          },
        })
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    return {
      totalUsers,
      totalRecruiters,
      totalJobSeekers,
      totalCompanies,
      totalJobs,
      totalApplications,
      recentUsers,
      recentRecruiters,
      recentJobs,
      recentApplications,
    };
  }

  static async getAllUsers(params: PaginationParams = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 10);
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (params.role && params.role !== "ALL") {
      filter.role = params.role;
    }

    if (params.status && params.status !== "ALL") {
      filter.status = params.status;
    }

    if (params.search) {
      const searchRegex = new RegExp(params.search, "i");
      filter.$or = [
        { email: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
      ];
    }

    const [items, totalItems] = await Promise.all([
      User.find(filter)
        .select("-password -refreshToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      totalItems,
      totalPages,
      currentPage: page,
      limit,
    };
  }

  static async getUserById(userId: string) {
    const user = await User.findById(userId).select("-password -refreshToken");

    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, ADMIN_MESSAGES.USER_NOT_FOUND);
    }

    return user;
  }

  static async blockUser(userId: string) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, ADMIN_MESSAGES.USER_NOT_FOUND);
    }

    user.status = UserStatus.BLOCKED;
    await user.save();

    return user;
  }

  static async unblockUser(userId: string) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, ADMIN_MESSAGES.USER_NOT_FOUND);
    }

    user.status = UserStatus.ACTIVE;
    await user.save();

    return user;
  }

  static async getAllJobs(params: PaginationParams = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 10);
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (params.employmentType && params.employmentType !== "ALL") {
      filter.employmentType = params.employmentType;
    }

    if (params.search) {
      const searchRegex = new RegExp(params.search, "i");
      filter.$or = [{ title: searchRegex }, { location: searchRegex }];
    }

    const [items, totalItems] = await Promise.all([
      Job.find(filter)
        .populate("companyId", "companyName logo")
        .populate("recruiterId", "email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Job.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      totalItems,
      totalPages,
      currentPage: page,
      limit,
    };
  }

  static async deleteJob(jobId: string) {
    const job = await Job.findById(jobId);

    if (!job) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, ADMIN_MESSAGES.JOB_NOT_FOUND);
    }

    await job.deleteOne();
    return;
  }

  static async getAllApplications(params: PaginationParams = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 10);
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (params.status && params.status !== "ALL") {
      filter.status = params.status;
    }

    const [items, totalItems] = await Promise.all([
      Application.find(filter)
        .populate("applicantId")
        .populate({
          path: "jobId",
          populate: {
            path: "companyId",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Application.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      totalItems,
      totalPages,
      currentPage: page,
      limit,
    };
  }
}