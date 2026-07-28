import { RecruiterProfile, User } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { RECRUITER_MESSAGES } from "./recruiter.constants";
import {
  CreateRecruiterProfileInput,
  UpdateRecruiterProfileInput,
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