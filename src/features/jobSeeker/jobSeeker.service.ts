import { JobSeekerProfile, User } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { JOB_SEEKER_MESSAGES } from "./jobSeeker.constants";
import {
  CreateJobSeekerProfileInput,
  UpdateJobSeekerProfileInput,
  JobSeekerQuery,
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

    const sanitizedPayload = sanitizeProfilePayload(payload);

    const profile = await JobSeekerProfile.create({
      userId,
      ...sanitizedPayload,
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
   * Get All Candidate Profiles with Pagination
   */
  static async getAllProfiles(query: JobSeekerQuery) {
    const filter: any = {};

    if (query.search) {
      filter.$or = [
        { firstName: { $regex: query.search, $options: "i" } },
        { lastName: { $regex: query.search, $options: "i" } },
        { headline: { $regex: query.search, $options: "i" } },
      ];
    }

    if (query.location) {
      filter.currentLocation = { $regex: query.location, $options: "i" };
    }

    if (query.skill) {
      filter.skills = { $in: [new RegExp(query.skill, "i")] };
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const profiles = await JobSeekerProfile.find(filter)
      .populate("userId", "email role createdAt")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await JobSeekerProfile.countDocuments(filter);

    return {
      profiles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get Single Profile by ID
   */
  static async getProfileById(profileId: string) {
    const profile = await JobSeekerProfile.findById(profileId).populate(
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
    const sanitizedPayload = sanitizeProfilePayload(payload);

    const profile =
      await JobSeekerProfile.findOneAndUpdate(
        {
          userId,
        },
        {
          $set: sanitizedPayload,
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

const sanitizeProfilePayload = (payload: any) => {
  const sanitized = { ...payload };

  if (Array.isArray(sanitized.education)) {
    sanitized.education = sanitized.education
      .filter(
        (edu: any) =>
          (edu.institution && edu.institution.trim() !== "") ||
          (edu.degree && edu.degree.trim() !== "")
      )
      .map((edu: any) => {
        const item = { ...edu };
        if (!item.startDate || item.startDate === "") delete item.startDate;
        else item.startDate = new Date(item.startDate);
        if (!item.endDate || item.endDate === "") delete item.endDate;
        else item.endDate = new Date(item.endDate);
        return item;
      });
  }

  if (Array.isArray(sanitized.experience)) {
    sanitized.experience = sanitized.experience
      .filter(
        (exp: any) =>
          (exp.company && exp.company.trim() !== "") ||
          (exp.designation && exp.designation.trim() !== "")
      )
      .map((exp: any) => {
        const item = { ...exp };
        if (!item.startDate || item.startDate === "") delete item.startDate;
        else item.startDate = new Date(item.startDate);
        if (!item.endDate || item.endDate === "") delete item.endDate;
        else item.endDate = new Date(item.endDate);
        return item;
      });
  }

  return sanitized;
};