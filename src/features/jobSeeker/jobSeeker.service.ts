import { JobSeekerProfile, User, UserProfile } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { JOB_SEEKER_MESSAGES } from "./jobSeeker.constants";
import {
  CreateJobSeekerProfileInput,
  UpdateJobSeekerProfileInput,
  JobSeekerQuery,
} from "./jobSeeker.types";

function escapeRegExp(str: string): string {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
   * Get My Profile (with auto-create fallback)
   */
  static async getProfile(userId: string) {
    let profile = await JobSeekerProfile.findOne({
      userId,
    }).populate(
      "userId",
      "email role createdAt"
    );

    if (!profile) {
      const user = await User.findById(userId);
      if (user && user.role === Role.JOB_SEEKER) {
        await JobSeekerProfile.create({
          userId,
          firstName: user.email.split("@")[0],
          lastName: "",
        });
        profile = await JobSeekerProfile.findOne({ userId }).populate(
          "userId",
          "email role createdAt"
        );
      }
    }

    if (!profile) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        JOB_SEEKER_MESSAGES.PROFILE_NOT_FOUND
      );
    }

    const userProf = await UserProfile.findOne({ userId });
    const profileObj: any = profile.toObject();
    if (userProf) {
      profileObj.skills = userProf.skills || [];
      profileObj.headline = userProf.headline || "";
      profileObj.bio = userProf.bio || "";
      if (userProf.profilePicture) {
        profileObj.profilePicture = userProf.profilePicture;
      }
    }

    return profileObj;
  }

  /**
   * Get All Candidate Profiles with Pagination & Safe Regex Filtering
   */
  static async getAllProfiles(query: JobSeekerQuery) {
    const filter: any = {};

    if (query.search && String(query.search).trim()) {
      const s = escapeRegExp(String(query.search).trim());
      const isSingleLetter = s.length === 1;
      const nameRegex = isSingleLetter ? `^${s}` : s;

      const matchingUserProfiles = await UserProfile.find({
        $or: [
          { firstName: { $regex: nameRegex, $options: "i" } },
          { lastName: { $regex: nameRegex, $options: "i" } },
          { headline: { $regex: s, $options: "i" } },
        ],
      }).select("userId");

      const matchingUserIds = matchingUserProfiles.map((up: any) => up.userId);

      filter.$or = [
        { firstName: { $regex: nameRegex, $options: "i" } },
        { lastName: { $regex: nameRegex, $options: "i" } },
        { headline: { $regex: s, $options: "i" } },
        { userId: { $in: matchingUserIds } },
      ];
    }

    if (query.location && String(query.location).trim()) {
      const loc = escapeRegExp(String(query.location).trim());
      filter.currentLocation = { $regex: loc, $options: "i" };
    }

    if (query.skill && String(query.skill).trim()) {
      const sk = escapeRegExp(String(query.skill).trim());
      filter.skills = { $in: [new RegExp(sk, "i")] };
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const rawProfiles = await JobSeekerProfile.find(filter)
      .populate("userId", "email role createdAt")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await JobSeekerProfile.countDocuments(filter);

    // Merge UserProfile data (profilePicture, real names, skills, headline, bio)
    const userIds = rawProfiles
      .map((p: any) => p.userId?._id || p.userId)
      .filter(Boolean);
    const userProfiles = await UserProfile.find({ userId: { $in: userIds } });
    const userProfileMap = new Map();
    userProfiles.forEach((up: any) => {
      userProfileMap.set(String(up.userId), up);
    });

    const profiles = rawProfiles.map((p: any) => {
      const pObj: any = p.toObject ? p.toObject() : { ...p };
      const uId = String(p.userId?._id || p.userId);
      const uProf = userProfileMap.get(uId);
      if (uProf) {
        if (uProf.firstName) pObj.firstName = uProf.firstName;
        if (uProf.lastName) pObj.lastName = uProf.lastName;
        if (uProf.headline) pObj.headline = uProf.headline;
        if (uProf.bio) pObj.bio = uProf.bio;
        if (uProf.profilePicture) pObj.profilePicture = uProf.profilePicture;
        if (uProf.skills && uProf.skills.length > 0) pObj.skills = uProf.skills;
        if (!pObj.currentLocation && uProf.location?.city) {
          pObj.currentLocation = `${uProf.location.city}${
            uProf.location.country ? `, ${uProf.location.country}` : ""
          }`;
        }
      }
      return pObj;
    });

    return {
      profiles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
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

    let profile =
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
      // Auto-create on update if not present
      profile = await JobSeekerProfile.create({
        userId,
        ...sanitizedPayload,
      }) as any;
      profile = await JobSeekerProfile.findById((profile as any)._id).populate(
        "userId",
        "email role createdAt"
      );
    }

    if (!profile) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        JOB_SEEKER_MESSAGES.PROFILE_NOT_FOUND
      );
    }

    const userProfileUpdates: any = {};
    if (sanitizedPayload.firstName !== undefined) userProfileUpdates.firstName = sanitizedPayload.firstName;
    if (sanitizedPayload.lastName !== undefined) userProfileUpdates.lastName = sanitizedPayload.lastName;
    if (sanitizedPayload.phone !== undefined) userProfileUpdates.phone = sanitizedPayload.phone;
    if (sanitizedPayload.headline !== undefined) userProfileUpdates.headline = sanitizedPayload.headline;
    if (sanitizedPayload.bio !== undefined) userProfileUpdates.bio = sanitizedPayload.bio;
    if (sanitizedPayload.skills !== undefined) userProfileUpdates.skills = sanitizedPayload.skills;
    if (sanitizedPayload.profilePicture !== undefined) userProfileUpdates.profilePicture = sanitizedPayload.profilePicture;

    if (Object.keys(userProfileUpdates).length > 0) {
      await UserProfile.findOneAndUpdate(
        { userId },
        { $set: userProfileUpdates },
        { new: true, upsert: true }
      );
    }

    const userProf = await UserProfile.findOne({ userId });
    const profileObj: any = profile.toObject();
    if (userProf) {
      profileObj.skills = userProf.skills || [];
      profileObj.headline = userProf.headline || "";
      profileObj.bio = userProf.bio || "";
      if (userProf.profilePicture) {
        profileObj.profilePicture = userProf.profilePicture;
      }
    }

    return profileObj;
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