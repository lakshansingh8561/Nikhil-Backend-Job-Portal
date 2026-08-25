import { PipelineStage, Types } from "mongoose";
import {
  User,
  UserProfile,
  JobSeekerProfile,
  RecruiterProfile,
  Post,
  Connection,
  Follow,
} from "../../database/models";
import { Role } from "../../common/enums/role.enum";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import {
  ConnectionStatus,
  ViewerConnectionState,
} from "../../common/enums/connectionStatus.enum";
import { NotificationService } from "../notifications/notification.service";
import { emitToUser } from "../../common/utils/emitToUser";
import {
  AuthorDTO,
  buildExperienceLabel,
  hydrateAuthors,
  resolveEducationList,
  resolveExperienceList,
  resolveExperienceYears,
  unknownAuthor,
} from "./author.lookup";

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toObjectId = (value: Types.ObjectId | string): Types.ObjectId =>
  typeof value === "string" ? new Types.ObjectId(value) : value;

export interface UpdateMyProfilePayload {
  firstName?: string;
  lastName?: string;
  headline?: string;
  bio?: string;
  phone?: string;
  profilePicture?: string;
  coverPhoto?: string;
  skills?: string[];
  location?: Record<string, unknown>;
  socialLinks?: Record<string, unknown>;
  designation?: string;
  currentCompany?: string;
  department?: string;
  yearsOfExperience?: number;
  education?: unknown[];
  experience?: unknown[];
}

export class NetworkService {
  // ---------------------------------------------------------------------------
  // Directory
  // ---------------------------------------------------------------------------

  /**
   * Search the member directory.
   *
   * Filtering and pagination happen inside MongoDB. The previous implementation
   * loaded every user plus all three profile collections into memory and sliced
   * the array in JS, which does not survive a growing user base.
   */
  static async searchDirectory(
    query?: string,
    roleFilter?: string,
    page: number = 1,
    limit: number = 12,
    currentUserId?: string
  ) {
    const skip = (page - 1) * limit;

    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (roleFilter === Role.JOB_SEEKER || roleFilter === Role.RECRUITER) {
      match.role = roleFilter;
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: UserProfile.collection.name,
          localField: "_id",
          foreignField: "userId",
          as: "base",
        },
      },
      {
        $lookup: {
          from: RecruiterProfile.collection.name,
          localField: "_id",
          foreignField: "userId",
          as: "recruiter",
        },
      },
      {
        $lookup: {
          from: JobSeekerProfile.collection.name,
          localField: "_id",
          foreignField: "userId",
          as: "seeker",
        },
      },
      {
        $addFields: {
          base: { $first: "$base" },
          roleProfile: {
            $cond: [
              { $eq: ["$role", Role.RECRUITER] },
              { $first: "$recruiter" },
              { $first: "$seeker" },
            ],
          },
        },
      },
      {
        $addFields: {
          firstName: { $ifNull: ["$base.firstName", ""] },
          lastName: { $ifNull: ["$base.lastName", ""] },
          headline: { $ifNull: ["$base.headline", ""] },
          bio: { $ifNull: ["$base.bio", ""] },
          profilePicture: { $ifNull: ["$base.profilePicture", ""] },
          skills: { $ifNull: ["$base.skills", []] },
          city: { $ifNull: ["$base.location.city", ""] },
          designation: { $ifNull: ["$roleProfile.designation", ""] },
          currentCompany: { $ifNull: ["$roleProfile.currentCompany", ""] },
        },
      },
      {
        $addFields: {
          fullName: {
            $trim: { input: { $concat: ["$firstName", " ", "$lastName"] } },
          },
        },
      },
    ];

    const searchQuery = (query || "").trim();
    if (searchQuery.length > 0) {
      const rx = new RegExp(escapeRegex(searchQuery), "i");
      pipeline.push({
        $match: {
          $or: [
            { fullName: rx },
            { email: rx },
            { headline: rx },
            { designation: rx },
            { currentCompany: rx },
            { city: rx },
            { skills: rx },
          ],
        },
      });
    }

    pipeline.push({
      $facet: {
        data: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              email: 1,
              role: 1,
              createdAt: 1,
              firstName: 1,
              lastName: 1,
              fullName: 1,
              headline: 1,
              bio: 1,
              profilePicture: 1,
              skills: 1,
              city: 1,
              designation: 1,
              currentCompany: 1,
              roleProfile: 1,
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    });

    const [aggregated] = await User.aggregate(pipeline);
    const rows: any[] = aggregated?.data || [];
    const total: number = aggregated?.totalCount?.[0]?.count || 0;

    // Relationship state so the directory can show the right button per card.
    const relationships = currentUserId
      ? await NetworkService.getRelationshipMap(
          currentUserId,
          rows.map((row) => row._id.toString())
        )
      : new Map<string, ViewerConnectionState>();

    const users = rows.map((row) => {
      const isRecruiter = row.role === Role.RECRUITER;
      const id = row._id.toString();
      const expYears = resolveExperienceYears(row.roleProfile);
      const designation =
        row.designation || row.headline || (isRecruiter ? "Recruiter" : "Job Seeker");

      return {
        userId: id,
        email: row.email,
        role: row.role,
        fullName: row.fullName || row.email.split("@")[0],
        firstName: row.firstName,
        lastName: row.lastName,
        headline: row.headline || designation,
        designation,
        currentCompany: row.currentCompany || "",
        location: row.city || "",
        experienceYears: expYears,
        isFresher: expYears === 0,
        experienceLabel: buildExperienceLabel(expYears),
        bio: row.bio,
        profilePicture: row.profilePicture,
        skills: row.skills || [],
        joinedAt: row.createdAt,
        connectionStatus: relationships.get(id) || ViewerConnectionState.NONE,
      };
    });

    return {
      users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---------------------------------------------------------------------------
  // Public profile
  // ---------------------------------------------------------------------------

  static async getPublicProfile(targetUserId: string, viewerId?: string) {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid profile id.");
    }

    const targetObjectId = toObjectId(targetUserId);
    const user = await User.findById(targetObjectId).lean();

    if (!user || user.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User profile not found.");
    }

    const baseProfile = await UserProfile.findOne({ userId: targetObjectId }).lean();
    const isRecruiter = user.role === Role.RECRUITER;

    const roleSpecificProfile: any = isRecruiter
      ? await RecruiterProfile.findOne({ userId: targetObjectId }).lean()
      : await JobSeekerProfile.findOne({ userId: targetObjectId }).lean();

    const [postsCount, latestPosts, connectionsCount, followersCount, followingCount] =
      await Promise.all([
        Post.countDocuments({ userId: targetObjectId, isDeleted: { $ne: true } }),
        Post.find({ userId: targetObjectId, isDeleted: { $ne: true } })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
        Connection.countDocuments({
          status: ConnectionStatus.ACCEPTED,
          $or: [{ requesterId: targetObjectId }, { recipientId: targetObjectId }],
        }),
        Follow.countDocuments({ followingId: targetObjectId }),
        Follow.countDocuments({ followerId: targetObjectId }),
      ]);

    let connectionStatus = ViewerConnectionState.NONE;
    let isFollowing = false;
    let mutualConnectionsCount = 0;

    if (viewerId && viewerId === targetUserId) {
      connectionStatus = ViewerConnectionState.SELF;
    } else if (viewerId) {
      const [relationship, follow, mutual] = await Promise.all([
        NetworkService.getRelationshipMap(viewerId, [targetUserId]),
        Follow.exists({ followerId: toObjectId(viewerId), followingId: targetObjectId }),
        NetworkService.countMutualConnections(viewerId, targetUserId),
      ]);
      connectionStatus = relationship.get(targetUserId) || ViewerConnectionState.NONE;
      isFollowing = Boolean(follow);
      mutualConnectionsCount = mutual;
    }

    const firstName = baseProfile?.firstName || "";
    const lastName = baseProfile?.lastName || "";
    const fullName = `${firstName} ${lastName}`.trim() || user.email.split("@")[0];

    // `experience` is a year count on RecruiterProfile but a position array on
    // JobSeekerProfile, so both fields must be resolved through the shared helpers.
    const experienceYears = resolveExperienceYears(roleSpecificProfile);

    // The profile UI tells visitors to "connect to see contact details", so the
    // payload has to honour that too — otherwise the address is one devtools
    // panel away. Recruiter-facing candidate endpoints are unaffected.
    const canSeeContact =
      connectionStatus === ViewerConnectionState.SELF ||
      connectionStatus === ViewerConnectionState.CONNECTED;

    return {
      userId: user._id.toString(),
      email: canSeeContact ? user.email : "",
      role: user.role,
      fullName,
      firstName,
      lastName,
      phone: canSeeContact ? baseProfile?.phone || "" : "",
      headline:
        baseProfile?.headline ||
        roleSpecificProfile?.designation ||
        (isRecruiter ? "Recruiter" : "Job Seeker"),
      bio: baseProfile?.bio || "",
      profilePicture: baseProfile?.profilePicture || "",
      coverPhoto: baseProfile?.coverPhoto || "",
      skills: baseProfile?.skills || [],
      location: baseProfile?.location || {},
      socialLinks: baseProfile?.socialLinks || {},
      designation: roleSpecificProfile?.designation || baseProfile?.headline || "",
      currentCompany: roleSpecificProfile?.currentCompany || "",
      department: roleSpecificProfile?.department || "",
      experienceYears,
      isFresher: experienceYears === 0,
      experienceLabel: buildExperienceLabel(experienceYears),
      education: resolveEducationList(roleSpecificProfile),
      experienceList: resolveExperienceList(roleSpecificProfile),
      resumeUrl: canSeeContact
        ? roleSpecificProfile?.resumeUrl || roleSpecificProfile?.resume || ""
        : "",
      expectedSalary: roleSpecificProfile?.expectedSalary || 0,
      noticePeriodDays: roleSpecificProfile?.noticePeriodDays || 0,
      postsCount,
      latestPosts,
      connectionsCount,
      followersCount,
      followingCount,
      mutualConnectionsCount,
      connectionStatus,
      isFollowing,
      isSelf: connectionStatus === ViewerConnectionState.SELF,
      joinedAt: user.createdAt,
    };
  }

  /**
   * One role-agnostic profile editor.
   *
   * The existing `/job-seeker/profile` and `/recruiter/profile` endpoints are
   * each gated behind `authorize(Role.X)`, so neither can back a shared profile
   * UI. This writes the common fields to UserProfile and routes the rest to
   * whichever role profile the caller owns.
   */
  static async updateMyProfile(userId: string, role: Role, payload: UpdateMyProfilePayload) {
    const userObjectId = toObjectId(userId);

    const baseUpdate: Record<string, unknown> = {};
    const assign = (key: keyof UpdateMyProfilePayload, field = key as string) => {
      if (payload[key] !== undefined) baseUpdate[field] = payload[key];
    };

    assign("firstName");
    assign("lastName");
    assign("headline");
    assign("bio");
    assign("phone");
    assign("profilePicture");
    assign("coverPhoto");
    assign("skills");
    assign("location");
    assign("socialLinks");

    if (Object.keys(baseUpdate).length > 0) {
      await UserProfile.findOneAndUpdate(
        { userId: userObjectId },
        { $set: baseUpdate },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    const roleUpdate: Record<string, unknown> = {};
    if (role === Role.RECRUITER) {
      if (payload.designation !== undefined) roleUpdate.designation = payload.designation;
      if (payload.currentCompany !== undefined) roleUpdate.currentCompany = payload.currentCompany;
      if (payload.department !== undefined) roleUpdate.department = payload.department;
      // Recruiters store years directly on `experience`.
      if (payload.yearsOfExperience !== undefined) roleUpdate.experience = payload.yearsOfExperience;

      if (Object.keys(roleUpdate).length > 0) {
        await RecruiterProfile.findOneAndUpdate(
          { userId: userObjectId },
          { $set: roleUpdate },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      }
    } else {
      if (payload.education !== undefined) roleUpdate.education = payload.education;
      // Job seekers store positions on `experience` and years separately.
      if (payload.experience !== undefined) roleUpdate.experience = payload.experience;
      if (payload.yearsOfExperience !== undefined) {
        roleUpdate.yearsOfExperience = payload.yearsOfExperience;
      }

      if (Object.keys(roleUpdate).length > 0) {
        await JobSeekerProfile.findOneAndUpdate(
          { userId: userObjectId },
          { $set: roleUpdate },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      }
    }

    return NetworkService.getPublicProfile(userId, userId);
  }

  // ---------------------------------------------------------------------------
  // Invitations & connections
  // ---------------------------------------------------------------------------

  /** Viewer-relative state for a batch of profiles, used by cards and lists. */
  private static async getRelationshipMap(
    viewerId: string,
    targetIds: string[]
  ): Promise<Map<string, ViewerConnectionState>> {
    const result = new Map<string, ViewerConnectionState>();
    if (targetIds.length === 0) return result;

    const viewer = toObjectId(viewerId);
    const targets = targetIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const rows = await Connection.find({
      $or: [
        { requesterId: viewer, recipientId: { $in: targets } },
        { requesterId: { $in: targets }, recipientId: viewer },
      ],
    }).lean();

    for (const id of targetIds) {
      result.set(id, id === viewerId ? ViewerConnectionState.SELF : ViewerConnectionState.NONE);
    }

    for (const row of rows) {
      const isOutgoing = row.requesterId.toString() === viewerId;
      const otherId = isOutgoing ? row.recipientId.toString() : row.requesterId.toString();

      if (row.status === ConnectionStatus.ACCEPTED) {
        result.set(otherId, ViewerConnectionState.CONNECTED);
      } else if (row.status === ConnectionStatus.PENDING) {
        result.set(
          otherId,
          isOutgoing
            ? ViewerConnectionState.PENDING_OUTGOING
            : ViewerConnectionState.PENDING_INCOMING
        );
      }
      // IGNORED / WITHDRAWN intentionally read as NONE so a fresh invite is allowed.
    }

    return result;
  }

  /** Accepted-connection ids for a user. */
  private static async getConnectedIds(userId: string): Promise<string[]> {
    const me = toObjectId(userId);
    const rows = await Connection.find({
      status: ConnectionStatus.ACCEPTED,
      $or: [{ requesterId: me }, { recipientId: me }],
    })
      .select("requesterId recipientId")
      .lean();

    return rows.map((row) =>
      row.requesterId.toString() === userId
        ? row.recipientId.toString()
        : row.requesterId.toString()
    );
  }

  private static async countMutualConnections(
    viewerId: string,
    targetId: string
  ): Promise<number> {
    const [mine, theirs] = await Promise.all([
      NetworkService.getConnectedIds(viewerId),
      NetworkService.getConnectedIds(targetId),
    ]);

    const mineSet = new Set(mine);
    return theirs.filter((id) => mineSet.has(id)).length;
  }

  static async sendInvite(requesterId: string, recipientId: string, message?: string) {
    if (requesterId === recipientId) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "You cannot connect with yourself.");
    }
    if (!Types.ObjectId.isValid(recipientId)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid recipient.");
    }

    const recipient = await User.findById(recipientId).select("_id isDeleted").lean();
    if (!recipient || recipient.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "That member no longer exists.");
    }

    const requester = toObjectId(requesterId);
    const target = toObjectId(recipientId);

    // Check both orderings so A->B and B->A can never both be pending.
    const existing = await Connection.findOne({
      $or: [
        { requesterId: requester, recipientId: target },
        { requesterId: target, recipientId: requester },
      ],
    });

    if (existing) {
      if (existing.status === ConnectionStatus.ACCEPTED) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "You are already connected.");
      }
      if (existing.status === ConnectionStatus.PENDING) {
        if (existing.requesterId.toString() === requesterId) {
          throw new ApiError(HTTP_STATUS.CONFLICT, "Your invitation is already pending.");
        }
        // They invited you first — accept rather than create a mirror row.
        return NetworkService.acceptInvite(requesterId, existing._id.toString());
      }

      // A previously ignored or withdrawn invitation can be re-sent.
      existing.requesterId = requester;
      existing.recipientId = target;
      existing.status = ConnectionStatus.PENDING;
      existing.message = (message || "").trim();
      existing.respondedAt = null;
      await existing.save();

      await NetworkService.announceInvite(requesterId, recipientId, existing._id.toString());
      return { connectionId: existing._id.toString(), status: existing.status };
    }

    const created = await Connection.create({
      requesterId: requester,
      recipientId: target,
      status: ConnectionStatus.PENDING,
      message: (message || "").trim(),
    });

    await NetworkService.announceInvite(requesterId, recipientId, created._id.toString());
    return { connectionId: created._id.toString(), status: created.status };
  }

  private static async announceInvite(
    requesterId: string,
    recipientId: string,
    connectionId: string
  ) {
    const authors = await hydrateAuthors([requesterId]);
    const requester = authors.get(requesterId) || unknownAuthor(requesterId);

    await NotificationService.createNotification({
      recipientId,
      senderId: requesterId,
      type: "CONNECTION_INVITE",
      title: "New invitation",
      message: `${requester.fullName} wants to connect with you.`,
      link: `/network/connections`,
    });

    emitToUser(recipientId, "network:invite", { connectionId, from: requester });
    emitToUser(recipientId, "notification:new", { type: "CONNECTION_INVITE" });
  }

  static async acceptInvite(userId: string, connectionId: string) {
    const connection = await Connection.findById(connectionId);
    if (!connection) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Invitation not found.");
    if (connection.recipientId.toString() !== userId) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "This invitation isn't addressed to you.");
    }
    if (connection.status === ConnectionStatus.ACCEPTED) {
      return { connectionId, status: connection.status };
    }

    connection.status = ConnectionStatus.ACCEPTED;
    connection.respondedAt = new Date();
    await connection.save();

    const requesterId = connection.requesterId.toString();
    const authors = await hydrateAuthors([userId]);
    const accepter = authors.get(userId) || unknownAuthor(userId);

    await NotificationService.createNotification({
      recipientId: requesterId,
      senderId: userId,
      type: "CONNECTION_ACCEPTED",
      title: "Invitation accepted",
      message: `${accepter.fullName} accepted your invitation.`,
      link: `/network/profile/${userId}`,
    });

    emitToUser(requesterId, "network:invite-accepted", { connectionId, by: accepter });
    emitToUser(requesterId, "notification:new", { type: "CONNECTION_ACCEPTED" });

    return { connectionId, status: connection.status };
  }

  static async ignoreInvite(userId: string, connectionId: string) {
    const connection = await Connection.findById(connectionId);
    if (!connection) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Invitation not found.");
    if (connection.recipientId.toString() !== userId) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "This invitation isn't addressed to you.");
    }

    connection.status = ConnectionStatus.IGNORED;
    connection.respondedAt = new Date();
    await connection.save();

    return { connectionId, status: connection.status };
  }

  static async withdrawInvite(userId: string, connectionId: string) {
    const connection = await Connection.findById(connectionId);
    if (!connection) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Invitation not found.");
    if (connection.requesterId.toString() !== userId) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You can only withdraw your own invitations.");
    }
    if (connection.status === ConnectionStatus.ACCEPTED) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "That invitation was already accepted.");
    }

    await Connection.deleteOne({ _id: connection._id });
    return { connectionId, status: ConnectionStatus.WITHDRAWN };
  }

  static async removeConnection(userId: string, otherUserId: string) {
    const me = toObjectId(userId);
    const them = toObjectId(otherUserId);

    const result = await Connection.deleteOne({
      status: ConnectionStatus.ACCEPTED,
      $or: [
        { requesterId: me, recipientId: them },
        { requesterId: them, recipientId: me },
      ],
    });

    if (result.deletedCount === 0) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "You are not connected to that member.");
    }

    return { userId: otherUserId, removed: true };
  }

  /** Invitations waiting on the viewer's decision. */
  static async getReceivedInvites(userId: string, page = 1, limit = 12) {
    const skip = (page - 1) * limit;
    const filter = { recipientId: toObjectId(userId), status: ConnectionStatus.PENDING };

    const [rows, total] = await Promise.all([
      Connection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Connection.countDocuments(filter),
    ]);

    const authors = await hydrateAuthors(rows.map((row) => row.requesterId));

    return {
      invitations: rows.map((row) => ({
        connectionId: row._id.toString(),
        message: row.message || "",
        sentAt: row.createdAt,
        user: authors.get(row.requesterId.toString()) || unknownAuthor(row.requesterId.toString()),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Invitations the viewer has sent and can still withdraw. */
  static async getSentInvites(userId: string, page = 1, limit = 12) {
    const skip = (page - 1) * limit;
    const filter = { requesterId: toObjectId(userId), status: ConnectionStatus.PENDING };

    const [rows, total] = await Promise.all([
      Connection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Connection.countDocuments(filter),
    ]);

    const authors = await hydrateAuthors(rows.map((row) => row.recipientId));

    return {
      invitations: rows.map((row) => ({
        connectionId: row._id.toString(),
        message: row.message || "",
        sentAt: row.createdAt,
        user: authors.get(row.recipientId.toString()) || unknownAuthor(row.recipientId.toString()),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  static async getConnections(userId: string, query?: string, page = 1, limit = 12) {
    const connectedIds = await NetworkService.getConnectedIds(userId);

    if (connectedIds.length === 0) {
      return {
        connections: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const authors = await hydrateAuthors(connectedIds);
    let list = connectedIds
      .map((id) => authors.get(id) || unknownAuthor(id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const search = (query || "").trim().toLowerCase();
    if (search) {
      list = list.filter(
        (person) =>
          person.fullName.toLowerCase().includes(search) ||
          person.headline.toLowerCase().includes(search) ||
          person.currentCompany.toLowerCase().includes(search)
      );
    }

    const total = list.length;
    const skip = (page - 1) * limit;

    return {
      connections: list.slice(skip, skip + limit),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * "People you may know" — ranked by shared connections (2nd degree), then
   * padded with the newest members so the panel is never empty on a small
   * user base.
   */
  static async getSuggestions(userId: string, limit = 8) {
    const me = toObjectId(userId);
    const connectedIds = await NetworkService.getConnectedIds(userId);

    // Anyone already related to the viewer in any way is excluded.
    const relatedRows = await Connection.find({
      $or: [{ requesterId: me }, { recipientId: me }],
      status: { $in: [ConnectionStatus.PENDING, ConnectionStatus.ACCEPTED] },
    })
      .select("requesterId recipientId")
      .lean();

    const excluded = new Set<string>([userId]);
    for (const row of relatedRows) {
      excluded.add(row.requesterId.toString());
      excluded.add(row.recipientId.toString());
    }

    const scores = new Map<string, number>();

    if (connectedIds.length > 0) {
      const secondDegree = await Connection.find({
        status: ConnectionStatus.ACCEPTED,
        $or: [
          { requesterId: { $in: connectedIds.map(toObjectId) } },
          { recipientId: { $in: connectedIds.map(toObjectId) } },
        ],
      })
        .select("requesterId recipientId")
        .lean();

      const firstDegree = new Set(connectedIds);
      for (const row of secondDegree) {
        for (const side of [row.requesterId.toString(), row.recipientId.toString()]) {
          if (excluded.has(side) || firstDegree.has(side)) continue;
          scores.set(side, (scores.get(side) || 0) + 1);
        }
      }
    }

    const ranked = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, mutuals]) => ({ id, mutuals }));

    // Pad with newest members when the graph is too sparse to fill the panel.
    if (ranked.length < limit) {
      const skipIds = new Set([...excluded, ...ranked.map((r) => r.id)]);
      const fresh = await User.find({
        _id: { $nin: Array.from(skipIds).map(toObjectId) },
        isDeleted: { $ne: true },
      })
        .select("_id")
        .sort({ createdAt: -1 })
        .limit(limit - ranked.length)
        .lean();

      ranked.push(...fresh.map((u) => ({ id: u._id.toString(), mutuals: 0 })));
    }

    const authors = await hydrateAuthors(ranked.map((r) => r.id));

    return {
      suggestions: ranked.map((entry) => ({
        ...(authors.get(entry.id) || unknownAuthor(entry.id)),
        mutualConnectionsCount: entry.mutuals,
        connectionStatus: ViewerConnectionState.NONE,
      })),
    };
  }

  /** Counts for the left rail and the sidebar invitation badge. */
  static async getNetworkStats(userId: string) {
    const me = toObjectId(userId);

    const [connectionsCount, pendingInvitesCount, sentInvitesCount, followersCount, followingCount, postsCount] =
      await Promise.all([
        Connection.countDocuments({
          status: ConnectionStatus.ACCEPTED,
          $or: [{ requesterId: me }, { recipientId: me }],
        }),
        Connection.countDocuments({ recipientId: me, status: ConnectionStatus.PENDING }),
        Connection.countDocuments({ requesterId: me, status: ConnectionStatus.PENDING }),
        Follow.countDocuments({ followingId: me }),
        Follow.countDocuments({ followerId: me }),
        Post.countDocuments({ userId: me, isDeleted: { $ne: true } }),
      ]);

    return {
      connectionsCount,
      pendingInvitesCount,
      sentInvitesCount,
      followersCount,
      followingCount,
      postsCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Follows
  // ---------------------------------------------------------------------------

  static async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "You cannot follow yourself.");
    }

    const target = await User.findById(followingId).select("_id isDeleted").lean();
    if (!target || target.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "That member no longer exists.");
    }

    const filter = { followerId: toObjectId(followerId), followingId: toObjectId(followingId) };
    const existing = await Follow.findOne(filter);
    if (existing) return { followingId, isFollowing: true };

    await Follow.create(filter);

    const authors = await hydrateAuthors([followerId]);
    const follower = authors.get(followerId) || unknownAuthor(followerId);

    await NotificationService.createNotification({
      recipientId: followingId,
      senderId: followerId,
      type: "NEW_FOLLOWER",
      title: "New follower",
      message: `${follower.fullName} started following you.`,
      link: `/network/profile/${followerId}`,
    });
    emitToUser(followingId, "notification:new", { type: "NEW_FOLLOWER" });

    return { followingId, isFollowing: true };
  }

  static async unfollowUser(followerId: string, followingId: string) {
    await Follow.deleteOne({
      followerId: toObjectId(followerId),
      followingId: toObjectId(followingId),
    });

    return { followingId, isFollowing: false };
  }

  static async getFollowers(userId: string, page = 1, limit = 12) {
    return NetworkService.listFollows({ followingId: toObjectId(userId) }, "followerId", page, limit);
  }

  static async getFollowing(userId: string, page = 1, limit = 12) {
    return NetworkService.listFollows({ followerId: toObjectId(userId) }, "followingId", page, limit);
  }

  private static async listFollows(
    filter: Record<string, unknown>,
    field: "followerId" | "followingId",
    page: number,
    limit: number
  ) {
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      Follow.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Follow.countDocuments(filter),
    ]);

    const authors = await hydrateAuthors(rows.map((row) => row[field]));

    const users: AuthorDTO[] = rows.map(
      (row) => authors.get(row[field].toString()) || unknownAuthor(row[field].toString())
    );

    return {
      users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
