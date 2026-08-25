import { Types } from "mongoose";
import { User, UserProfile } from "../../database/models";

/** `#hashtag` — letters, digits and underscore, at least one non-digit. */
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]{1,60})/gu;

/** `@Some Name` or `@email@host` — greedy up to two capitalised words. */
const MENTION_PATTERN = /@([\p{L}][\p{L}\p{N}._-]{1,40}(?:\s[\p{L}][\p{L}\p{N}._-]{1,40})?)/gu;

/**
 * Pull hashtags out of post/comment text, lowercased and de-duplicated so
 * `#Hiring` and `#hiring` land on the same topic page.
 */
export const extractHashtags = (content: string): string[] => {
  if (!content) return [];
  const found = new Set<string>();

  for (const match of content.matchAll(HASHTAG_PATTERN)) {
    const tag = match[1]?.toLowerCase();
    // Reject all-numeric tags — "#1" is almost always prose, not a topic.
    if (tag && !/^\d+$/.test(tag)) found.add(tag);
  }

  return Array.from(found);
};

/**
 * Resolve `@mentions` in text to real user ids.
 *
 * Matching is deliberately conservative: a mention only resolves when the text
 * matches a full name or an email prefix exactly (case-insensitively), so a
 * stray "@" in prose never notifies a random user.
 */
export const resolveMentions = async (content: string): Promise<Types.ObjectId[]> => {
  if (!content || !content.includes("@")) return [];

  const candidates = new Set<string>();
  for (const match of content.matchAll(MENTION_PATTERN)) {
    const handle = match[1]?.trim();
    if (handle) candidates.add(handle.toLowerCase());
  }
  if (candidates.size === 0) return [];

  const handles = Array.from(candidates).slice(0, 20);

  // Match against "First Last" on the profile, and against the email local part.
  const profiles = await UserProfile.find({
    $or: handles.map((handle) => {
      const [first, ...rest] = handle.split(/\s+/);
      const last = rest.join(" ");
      return last
        ? {
            firstName: new RegExp(`^${escapeRegex(first)}$`, "i"),
            lastName: new RegExp(`^${escapeRegex(last)}$`, "i"),
          }
        : { firstName: new RegExp(`^${escapeRegex(first)}$`, "i") };
    }),
  })
    .select("userId")
    .limit(20)
    .lean();

  const users = await User.find({
    email: { $in: handles.map((handle) => new RegExp(`^${escapeRegex(handle)}@`, "i")) },
  })
    .select("_id")
    .limit(20)
    .lean();

  const ids = new Set<string>();
  profiles.forEach((p) => ids.add(p.userId.toString()));
  users.forEach((u) => ids.add(u._id.toString()));

  return Array.from(ids).map((id) => new Types.ObjectId(id));
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
