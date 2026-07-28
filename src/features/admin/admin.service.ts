import {
  User,
  Job,
  Application,
} from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { UserStatus } from "../../common/enums/userStatus.enum";
import { ADMIN_MESSAGES } from "./admin.constants";

export class AdminService {
  static async getDashboardStats() {
    const [
      totalUsers,
      totalRecruiters,
      totalJobSeekers,
      totalJobs,
      totalApplications,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({
        role: Role.RECRUITER,
      }),
      User.countDocuments({
        role: Role.JOB_SEEKER,
      }),
      Job.countDocuments(),
      Application.countDocuments(),
    ]);

    return {
      totalUsers,
      totalRecruiters,
      totalJobSeekers,
      totalJobs,
      totalApplications,
    };
  }

  static async getAllUsers() {
    return User.find()
      .select("-password -refreshToken")
      .sort({ createdAt: -1 });
  }

  static async getUserById(userId: string) {
    const user = await User.findById(userId)
      .select("-password -refreshToken");

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        ADMIN_MESSAGES.USER_NOT_FOUND
      );
    }

    return user;
  }

  static async blockUser(userId: string) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        ADMIN_MESSAGES.USER_NOT_FOUND
      );
    }

    user.status = UserStatus.BLOCKED;

    await user.save();

    return user;
  }

  static async unblockUser(userId: string) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        ADMIN_MESSAGES.USER_NOT_FOUND
      );
    }

    user.status = UserStatus.ACTIVE;

    await user.save();

    return user;
  }

  static async getAllJobs() {
    return Job.find()
      .populate("companyId", "companyName")
      .populate("recruiterId", "email")
      .sort({ createdAt: -1 });
  }

  static async deleteJob(jobId: string) {
    const job = await Job.findById(jobId);

    if (!job) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        ADMIN_MESSAGES.JOB_NOT_FOUND
      );
    }

    await job.deleteOne();

    return;
  }
}