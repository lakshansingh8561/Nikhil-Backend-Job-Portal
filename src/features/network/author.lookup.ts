import { Types } from "mongoose";
import {
  User,
  UserProfile,
  JobSeekerProfile,
  RecruiterProfile,
} from "../../database/models";
import { Role } from "../../common/enums/role.enum";
import type { IEducation, IExperience } from "../../database/models/jobSeekerProfile/jobSeekerProfile.interface";

/**
 * The author shape every feed / directory / comment payload embeds.
 * Kept deliberately flat so the client never has to branch on role to read a field.
 */
export interface AuthorDTO {
  userId: string;
  email: string;
  role: Role;
  fullName: string;
  firstName: string;
  lastName: string;
  profilePicture: string;
  coverPhoto: string;
  headline: string;
  bio: string;
  currentCompany: string;
  designation: string;
  experienceYears: number;
  isFresher: boolean;
  experienceLabel: string;
  location: string;
  skills: string[];
  joinedAt?: Date;
}

/**
 * `experience` means two different things depending on the profile collection:
 *   - RecruiterProfile.experience  -> number  (years)
 *   - JobSeekerProfile.experience  -> IExperience[]  (positions held)
 * Reading it without discriminating produced `experienceYears: [{...}]` for job
 * seekers, which crashed the feed when React tried to render it as a number.
 * These two helpers are the single place that distinction is resolved.
 */
export const resolveExperienceYears = (roleProfile: any): number => {
  if (!roleProfile) return 0;

  // Job seekers store years separately from their position history.
  if (typeof roleProfile.yearsOfExperience === "number") {
    return roleProfile.yearsOfExperience;
  }

  // Recruiters store a plain year count on `experience`.
  if (typeof roleProfile.experience === "number") {
    return roleProfile.experience;
  }

  // Fall back to deriving years from the position list if that is all we have.
  if (Array.isArray(roleProfile.experience) && roleProfile.experience.length > 0) {
    return deriveYearsFromPositions(roleProfile.experience);
  }

  return 0;
};

export const resolveExperienceList = (roleProfile: any): IExperience[] => {
  if (!roleProfile) return [];
  return Array.isArray(roleProfile.experience) ? roleProfile.experience : [];
};

export const resolveEducationList = (roleProfile: any): IEducation[] => {
  if (!roleProfile) return [];
  return Array.isArray(roleProfile.education) ? roleProfile.education : [];
};

/** Total months across all positions, rounded down to whole years. */
const deriveYearsFromPositions = (positions: IExperience[]): number => {
  const totalMonths = positions.reduce((sum, position) => {
    if (!position?.startDate) return sum;

    const start = new Date(position.startDate);
    const end = position.currentlyWorking || !position.endDate
      ? new Date()
      : new Date(position.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return sum;
    }

    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());

    return sum + Math.max(0, months);
  }, 0);

  return Math.floor(totalMonths / 12);
};

export const buildExperienceLabel = (years: number): string => {
  if (!years || years <= 0) return "Fresher";
  return `${years} ${years === 1 ? "Yr" : "Yrs"} Exp`;
};

const toIdString = (id: Types.ObjectId | string): string =>
  typeof id === "string" ? id : id.toString();

/**
 * Batch-load author cards for a set of user ids.
 *
 * Replaces the previous per-post `getAuthorInfo`, which issued four queries for
 * every single post (a 10-post page cost ~40 round trips). This runs four
 * queries total regardless of how many authors are requested.
 */
export const hydrateAuthors = async (
  userIds: Array<Types.ObjectId | string | undefined | null>
): Promise<Map<string, AuthorDTO>> => {
  const uniqueIds = Array.from(
    new Set(
      userIds
        .filter((id): id is Types.ObjectId | string => Boolean(id))
        .map(toIdString)
    )
  );

  const result = new Map<string, AuthorDTO>();
  if (uniqueIds.length === 0) return result;

  const objectIds = uniqueIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const [users, baseProfiles, seekerProfiles, recruiterProfiles] = await Promise.all([
    User.find({ _id: { $in: objectIds } }).select("_id email role createdAt").lean(),
    UserProfile.find({ userId: { $in: objectIds } }).lean(),
    JobSeekerProfile.find({ userId: { $in: objectIds } }).lean(),
    RecruiterProfile.find({ userId: { $in: objectIds } }).lean(),
  ]);

  const baseMap = new Map(baseProfiles.map((p) => [p.userId.toString(), p]));
  const seekerMap = new Map(seekerProfiles.map((p) => [p.userId.toString(), p]));
  const recruiterMap = new Map(recruiterProfiles.map((p) => [p.userId.toString(), p]));

  for (const user of users) {
    const id = user._id.toString();
    const base: any = baseMap.get(id);
    const isRecruiter = user.role === Role.RECRUITER;
    const roleProfile: any = isRecruiter ? recruiterMap.get(id) : seekerMap.get(id);

    const firstName = base?.firstName || "";
    const lastName = base?.lastName || "";
    const fullName = `${firstName} ${lastName}`.trim() || user.email.split("@")[0];

    const years = resolveExperienceYears(roleProfile);
    const designation =
      roleProfile?.designation ||
      base?.headline ||
      (isRecruiter ? "Recruiter" : "Job Seeker");

    result.set(id, {
      userId: id,
      email: user.email,
      role: user.role,
      fullName,
      firstName,
      lastName,
      profilePicture: base?.profilePicture || roleProfile?.profilePicture || "",
      coverPhoto: base?.coverPhoto || "",
      headline: base?.headline || designation,
      bio: base?.bio || "",
      currentCompany: roleProfile?.currentCompany || "",
      designation,
      experienceYears: years,
      isFresher: years === 0,
      experienceLabel: buildExperienceLabel(years),
      location: base?.location?.city || "",
      skills: Array.isArray(base?.skills) ? base.skills : [],
      joinedAt: user.createdAt,
    });
  }

  return result;
};

/** Placeholder used when an author document has been hard-deleted. */
export const unknownAuthor = (userId: string): AuthorDTO => ({
  userId,
  email: "",
  role: Role.JOB_SEEKER,
  fullName: "Community Member",
  firstName: "",
  lastName: "",
  profilePicture: "",
  coverPhoto: "",
  headline: "Professional",
  bio: "",
  currentCompany: "",
  designation: "Professional",
  experienceYears: 0,
  isFresher: true,
  experienceLabel: "Fresher",
  location: "",
  skills: [],
});

/** Convenience wrapper for the single-author case. */
export const hydrateAuthor = async (
  userId: Types.ObjectId | string
): Promise<AuthorDTO> => {
  const id = toIdString(userId);
  const map = await hydrateAuthors([id]);
  return map.get(id) || unknownAuthor(id);
};
