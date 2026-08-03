import { RecruiterProfile, User } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { RECRUITER_MESSAGES } from "./recruiter.constants";
import {
  CreateRecruiterProfileInput,
  UpdateRecruiterProfileInput,
  RecruiterQuery,
} from "./recruiter.types";

export class RecruiterService {
  static async createProfile(
    userId: string,
    payload: CreateRecruiterProfileInput
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
        "Only Recruiters can create a profile."
      );
    }

    const existingProfile = await RecruiterProfile.findOne({
      userId,
    });

    if (existingProfile) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        RECRUITER_MESSAGES.PROFILE_ALREADY_EXISTS
      );
    }

    const profile = await RecruiterProfile.create({
      userId,
      ...payload,
    });

    return profile;
  }

  static async getProfile(userId: string) {
    const profile = await RecruiterProfile.findOne({
      userId,
    })
      .populate("userId", "email role")
      .populate("companyId");

    if (!profile) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        RECRUITER_MESSAGES.PROFILE_NOT_FOUND
      );
    }

    return profile;
  }

  static async getAllRecruiters(query: RecruiterQuery) {
    const filter: any = {};

    if (query.search) {
      filter.$or = [
        { firstName: { $regex: query.search, $options: "i" } },
        { lastName: { $regex: query.search, $options: "i" } },
        { currentCompany: { $regex: query.search, $options: "i" } },
        { designation: { $regex: query.search, $options: "i" } },
        { bio: { $regex: query.search, $options: "i" } },
        { headline: { $regex: query.search, $options: "i" } },
      ];
    }

    if (query.letter) {
      filter.currentCompany = { $regex: `^${query.letter}`, $options: "i" };
    }

    if (query.location) {
      filter.currentLocation = { $regex: query.location, $options: "i" };
    }

    if (query.industry) {
      filter.$or = filter.$or || [];
      filter.$or.push(
        { designation: { $regex: query.industry, $options: "i" } },
        { currentCompany: { $regex: query.industry, $options: "i" } },
        { headline: { $regex: query.industry, $options: "i" } }
      );
    }

    if (query.position) {
      filter.designation = { $regex: query.position, $options: "i" };
    }

    if (query.experience) {
      if (query.experience === "INTERNSHIP" || query.experience === "ENTRY") {
        filter.experience = { $lte: 2 };
      } else if (query.experience === "MID") {
        filter.experience = { $gte: 2, $lte: 5 };
      } else if (query.experience === "SENIOR") {
        filter.experience = { $gte: 5, $lte: 10 };
      } else if (query.experience === "EXECUTIVE") {
        filter.experience = { $gte: 10 };
      }
    }

    if (query.postedDate) {
      const now = new Date();
      if (query.postedDate === "24h") {
        filter.createdAt = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
      } else if (query.postedDate === "7d") {
        filter.createdAt = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
      } else if (query.postedDate === "30d") {
        filter.createdAt = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
      }
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const recruiters = await RecruiterProfile.find(filter)
      .populate("userId", "email role")
      .populate("companyId")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await RecruiterProfile.countDocuments(filter);

    return {
      recruiters,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  static async updateProfile(
    userId: string,
    payload: UpdateRecruiterProfileInput
  ) {
    const profile =
      await RecruiterProfile.findOneAndUpdate(
        { userId },
        {
          $set: payload,
        },
        {
          new: true,
          runValidators: true,
        }
      )
        .populate("userId", "email role")
        .populate("companyId");

    if (!profile) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        RECRUITER_MESSAGES.PROFILE_NOT_FOUND
      );
    }

    return profile;
  }
}