import { RecruiterProfile, User, Job, Company } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { Role } from "../../common/enums";
import { RECRUITER_MESSAGES } from "./recruiter.constants";
import {
  CreateRecruiterProfileInput,
  UpdateRecruiterProfileInput,
  RecruiterQuery,
} from "./recruiter.types";

function escapeRegExp(str: string): string {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    let profile = await RecruiterProfile.findOne({
      userId,
    })
      .populate("userId", "email role")
      .populate("companyId");

    if (!profile) {
      // Auto-create basic profile if it doesn't exist yet for logged-in recruiter
      const user = await User.findById(userId);
      if (user && user.role === Role.RECRUITER) {
        const newProfile = await RecruiterProfile.create({
          userId,
          firstName: user.email.split("@")[0],
          lastName: "",
          designation: "Recruiter",
        });
        profile = await RecruiterProfile.findById(newProfile._id)
          .populate("userId", "email role")
          .populate("companyId");
      }
    }

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

    if (query.search && String(query.search).trim()) {
      const s = escapeRegExp(String(query.search).trim());
      const matchingCompanies = await Company.find({
        $or: [
          { name: { $regex: s, $options: "i" } },
          { companyName: { $regex: s, $options: "i" } },
        ],
      }).select("_id");
      const companyIds = matchingCompanies.map((c) => c._id);

      filter.$or = [
        { firstName: { $regex: s, $options: "i" } },
        { lastName: { $regex: s, $options: "i" } },
        { currentCompany: { $regex: s, $options: "i" } },
        { designation: { $regex: s, $options: "i" } },
        { bio: { $regex: s, $options: "i" } },
        { headline: { $regex: s, $options: "i" } },
        { companyId: { $in: companyIds } },
      ];
    }

    if (query.letter && String(query.letter).trim()) {
      const l = escapeRegExp(String(query.letter).trim());
      const matchingCompanies = await Company.find({
        $or: [
          { name: { $regex: `^${l}`, $options: "i" } },
          { companyName: { $regex: `^${l}`, $options: "i" } },
        ],
      }).select("_id");
      const companyIds = matchingCompanies.map((c) => c._id);

      filter.$or = [
        { currentCompany: { $regex: `^${l}`, $options: "i" } },
        { companyId: { $in: companyIds } },
      ];
    }

    if (query.location && String(query.location).trim()) {
      const loc = escapeRegExp(String(query.location).trim());
      filter.currentLocation = { $regex: loc, $options: "i" };
    }

    if (query.industry && String(query.industry).trim()) {
      const ind = escapeRegExp(String(query.industry).trim());
      filter.$or = filter.$or || [];
      filter.$or.push(
        { designation: { $regex: ind, $options: "i" } },
        { currentCompany: { $regex: ind, $options: "i" } },
        { headline: { $regex: ind, $options: "i" } }
      );
    }

    if (query.position && String(query.position).trim()) {
      const pos = escapeRegExp(String(query.position).trim());
      filter.designation = { $regex: pos, $options: "i" };
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

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const recruiters = await RecruiterProfile.find(filter)
      .populate("userId", "email role")
      .populate("companyId")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await RecruiterProfile.countDocuments(filter);

    // Compute real open jobs count and ensure companyId is populated for each recruiter
    const recruitersWithJobs = await Promise.all(
      recruiters.map(async (rec) => {
        const recObj = rec.toObject();
        const recUserId = typeof rec.userId === "object" && rec.userId !== null ? (rec.userId as any)._id : rec.userId;

        if (!recObj.companyId && recUserId) {
          const comp = await Company.findOne({
            $or: [{ userId: recUserId }, { ownerId: recUserId }],
          }).catch(() => null);
          if (comp) {
            recObj.companyId = comp;
            recObj.currentCompany = comp.name;
          }
        }

        const openJobsCount = await Job.countDocuments({
          userId: recUserId,
          isActive: true,
        });

        return {
          ...recObj,
          openJobsCount,
        };
      })
    );

    return {
      recruiters: recruitersWithJobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  static async getRecruiterById(id: string) {
    const profile = await RecruiterProfile.findById(id)
      .populate("userId", "email role")
      .populate("companyId");

    if (!profile) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        RECRUITER_MESSAGES.PROFILE_NOT_FOUND
      );
    }

    const openJobs = await Job.find({
      userId: profile.userId,
      isActive: true,
    }).sort({ createdAt: -1 });

    return {
      profile,
      openJobs,
    };
  }

  static async updateProfile(
    userId: string,
    payload: UpdateRecruiterProfileInput
  ) {
    let profile = await RecruiterProfile.findOne({
      userId,
    });

    if (!profile) {
      profile = await RecruiterProfile.create({
        userId,
        ...payload,
      });
      return profile;
    }

    Object.assign(profile, payload);
    await profile.save();

    return profile;
  }
}