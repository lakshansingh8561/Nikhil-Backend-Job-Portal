import {
  User,
  Job,
  Application,
  Company,
  UserProfile,
  JobSeekerProfile,
  RecruiterProfile,
  Payment,
  Subscription,
} from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { UserStatus } from "../../common/enums/userStatus.enum";
import { ADMIN_MESSAGES } from "./admin.constants";

function escapeRegExp(str: string): string {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
      User.countDocuments({ isDeleted: { $ne: true } }),
      User.countDocuments({ role: Role.RECRUITER, isDeleted: { $ne: true } }),
      User.countDocuments({ role: Role.JOB_SEEKER, isDeleted: { $ne: true } }),
      Company.countDocuments({ isDeleted: { $ne: true } }),
      Job.countDocuments({ isDeleted: { $ne: true } }),
      Application.countDocuments({ isDeleted: { $ne: true } }),
      User.find({ isDeleted: { $ne: true } })
        .select("-password -refreshToken")
        .sort({ createdAt: -1 })
        .limit(5),
      User.find({ role: Role.RECRUITER, isDeleted: { $ne: true } })
        .select("-password -refreshToken")
        .sort({ createdAt: -1 })
        .limit(5),
      Job.find({ isDeleted: { $ne: true } })
        .populate("companyId", "companyName logo")
        .populate("userId", "email")
        .sort({ createdAt: -1 })
        .limit(5),
      Application.find({ isDeleted: { $ne: true } })
        .populate("userId")
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

    const filter: any = { isDeleted: { $ne: true } };

    if (params.role && params.role !== "ALL") {
      filter.role = params.role;
    }

    if (params.status && params.status !== "ALL") {
      filter.status = params.status;
    }

    if (params.search && String(params.search).trim()) {
      const searchRegex = new RegExp(escapeRegExp(String(params.search).trim()), "i");
      filter.$or = [
        { email: searchRegex },
      ];
    }

    const [rawUsers, totalItems] = await Promise.all([
      User.find(filter)
        .select("-password -refreshToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const userIds = rawUsers.map((u: any) => u._id);

    const activeSubscriptions = await Subscription.find({
      userId: { $in: userIds },
      status: "ACTIVE",
      endDate: { $gt: new Date() },
    }).lean();

    const subMap = new Map();
    activeSubscriptions.forEach((sub: any) => {
      subMap.set(sub.userId.toString(), sub);
    });

    const now = new Date();

    const items = rawUsers.map((u: any) => {
      const sub = subMap.get(u._id.toString());
      let membership = {
        planName: "Free",
        status: "FREE",
        remainingDays: 0,
        endDate: null,
      };

      if (sub) {
        const diffMs = new Date(sub.endDate).getTime() - now.getTime();
        const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        membership = {
          planName: sub.planName,
          status: sub.status,
          remainingDays: days,
          endDate: sub.endDate,
        };
      }

      return {
        ...u,
        membership,
      };
    });

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
    const user = await User.findOne({ _id: userId, isDeleted: { $ne: true } }).select("-password -refreshToken");

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

  static async deleteUser(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, ADMIN_MESSAGES.USER_NOT_FOUND);
    }

    const now = new Date();
    user.isDeleted = true;
    user.deletedAt = now;
    await user.save();

    await UserProfile.findOneAndUpdate({ userId }, { $set: { isDeleted: true, deletedAt: now } }).catch(() => null);
    await JobSeekerProfile.findOneAndUpdate({ userId }, { $set: { isDeleted: true, deletedAt: now } }).catch(() => null);
    await RecruiterProfile.findOneAndUpdate({ userId }, { $set: { isDeleted: true, deletedAt: now } }).catch(() => null);

    return;
  }

  static async getAllJobs(params: PaginationParams = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 10);
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: { $ne: true } };

    if (params.employmentType && params.employmentType !== "ALL") {
      filter.employmentType = params.employmentType;
    }

    if (params.search && String(params.search).trim()) {
      const searchRegex = new RegExp(escapeRegExp(String(params.search).trim()), "i");
      filter.$or = [{ title: searchRegex }, { location: searchRegex }];
    }

    const [items, totalItems] = await Promise.all([
      Job.find(filter)
        .populate("companyId", "companyName logo")
        .populate("userId", "email")
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

    job.isDeleted = true;
    job.deletedAt = new Date();
    await job.save();
    return;
  }

  static async getAllApplications(params: PaginationParams = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 10);
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: { $ne: true } };

    if (params.status && params.status !== "ALL") {
      filter.status = params.status;
    }

    const [items, totalItems] = await Promise.all([
      Application.find(filter)
        .populate("userId")
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

  static async getMembershipStats() {
    const [
      totalRevenueResult,
      successfulPayments,
      failedPayments,
      activeSubscriptions,
      expiredSubscriptions,
      seekerSubscribers,
      recruiterSubscribers,
      recentTransactions,
    ] = await Promise.all([
      Payment.aggregate([
        { $match: { status: { $in: ["CAPTURED", "SUCCESS"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Payment.countDocuments({ status: { $in: ["CAPTURED", "SUCCESS"] } }),
      Payment.countDocuments({ status: "FAILED" }),
      Subscription.countDocuments({ status: "ACTIVE" }),
      Subscription.countDocuments({ status: "EXPIRED" }),
      Subscription.countDocuments({ status: "ACTIVE", role: Role.JOB_SEEKER }),
      Subscription.countDocuments({ status: "ACTIVE", role: Role.RECRUITER }),
      Payment.find()
        .populate("userId", "email role")
        .populate("membershipId", "name role price")
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    const totalRevenueInRupees = (totalRevenueResult[0]?.total || 0) / 100;

    return {
      totalRevenue: totalRevenueInRupees,
      successfulPayments,
      failedPayments,
      activeSubscriptions,
      expiredSubscriptions,
      seekerSubscribers,
      recruiterSubscribers,
      recentTransactions,
    };
  }
}