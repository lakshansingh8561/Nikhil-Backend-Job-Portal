import { JobSeekerProfile, User } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { JOB_SEEKER_MESSAGES } from "./jobSeeker.constants";
import {
  CreateJobSeekerProfileInput,
  UpdateJobSeekerProfileInput,
} from "./jobSeeker.types";

export class JobSeekerService {
  /**
   * Create Profile
   */
  static async createProfile(
    userId: string,
    payload: CreateJobSeekerProfileInput
  ) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        "User not found."
      );
    }

    if (user.role !== Role.JOB_SEEKER) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        "Only Job Seekers can create a profile."
      );
    }

    const existingProfile = await JobSeekerProfile.findOne({
      userId,
    });

    if (existingProfile) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        JOB_SEEKER_MESSAGES.PROFILE_ALREADY_EXISTS
      );
    }

    const profile = await JobSeekerProfile.create({
      userId,
      ...payload,
    });

    return profile;
  }

  /**
   * Get My Profile
   */
  static async getProfile(userId: string) {
    const profile = await JobSeekerProfile.findOne({
      userId,
    }).populate(
      "userId",
      "email role createdAt"
    );

    if (!profile) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        JOB_SEEKER_MESSAGES.PROFILE_NOT_FOUND
      );
    }

    return profile;
  }

  /**
   * Update Profile
   */
  static async updateProfile(
    userId: string,
    payload: UpdateJobSeekerProfileInput
  ) {
    const profile =
      await JobSeekerProfile.findOneAndUpdate(
        {
          userId,
        },
        {
          $set: payload,
        },
        {
          new: true,
          runValidators: true,
        }
      ).populate(
        "userId",
        "email role createdAt"
      );

    if (!profile) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        JOB_SEEKER_MESSAGES.PROFILE_NOT_FOUND
      );
    }

    return profile;
  }
}