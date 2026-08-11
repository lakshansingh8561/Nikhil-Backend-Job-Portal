import { Types } from "mongoose";
import { Application, ApplicationStatusHistory, Job, User, UserProfile } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { APPLICATION_MESSAGES } from "./application.constants";
import {
  ApplyJobInput,
  UpdateApplicationStatusInput,
} from "./application.types";
import { EmailService } from "../../common/services/email.service";
import { NotificationService } from "../notifications/notification.service";

export class ApplicationService {
  static async applyJob(
    userId: string,
    jobId: string,
    payload: ApplyJobInput
  ) {
    const job = await Job.findById(jobId).populate("companyId");
    if (!job) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        APPLICATION_MESSAGES.APPLICATION_NOT_FOUND
      );
    }

    if (job.status !== "ACTIVE") {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        APPLICATION_MESSAGES.JOB_CLOSED
      );
    }

    const existingApplication = await Application.findOne({
      jobId,
      userId,
    });

    if (existingApplication) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        APPLICATION_MESSAGES.APPLICATION_ALREADY_EXISTS
      );
    }

    const application = await Application.create({
      jobId,
      userId,
      resumeUrl: payload.resume,
      coverLetter: payload.coverLetter,
      status: "SUBMITTED",
    });

    const profile = await UserProfile.findOne({ userId });
    const applicantUser = await User.findById(userId);
    const applicantFullName = profile
      ? `${profile.firstName} ${profile.lastName}`.trim()
      : applicantUser?.email?.split("@")[0] || "Candidate";

    const companyName = (job.companyId as any)?.name || "Hiring Company";

    if (applicantUser?.email) {
      EmailService.sendApplicationConfirmationToJobSeeker({
        applicantEmail: applicantUser.email,
        applicantName: applicantFullName,
        jobTitle: job.title,
        companyName,
      }).catch((err) => console.error("Job seeker confirmation email failed:", err));
    }

    if (job.userId) {
      const recruiterUser = await User.findById(job.userId);

      await NotificationService.createNotification({
        recipientId: job.userId.toString(),
        senderId: userId,
        type: "APPLICATION_SUBMITTED",
        title: "New Applicant Received",
        message: `${applicantFullName} applied for "${job.title}".`,
        link: `/recruiter/jobs/${jobId}/applications`,
      }).catch(() => null);

      if (recruiterUser?.email) {
        EmailService.sendApplicationSubmittedToRecruiter({
          recruiterEmail: recruiterUser.email,
          applicantName: applicantFullName,
          applicantEmail: applicantUser?.email || "",
          jobTitle: job.title,
          companyName,
          coverLetter: payload.coverLetter,
        }).catch((err) => console.error("Recruiter email send failed:", err));
      }
    }

    return application;
  }

  static async getMyApplications(userId: string) {
    return Application.find({
      userId,
    })
      .populate({
        path: "jobId",
        populate: {
          path: "companyId",
        },
      })
      .sort({
        createdAt: -1,
      });
  }

  static async getRecruiterAllApplications(recruiterId: string) {
    const recruiterJobs = await Job.find({
      $or: [
        { userId: new Types.ObjectId(recruiterId) },
        { recruiterId: new Types.ObjectId(recruiterId) },
      ],
    }).select("_id");

    const jobIds = recruiterJobs.map((j) => j._id);

    const applications = await Application.find({
      $or: [
        { jobId: { $in: jobIds } },
        { recruiterId: new Types.ObjectId(recruiterId) },
      ],
    })
      .populate("jobId", "title location companyId userId recruiterId")
      .populate("userId", "email role")
      .populate("applicantId", "email role")
      .populate("candidateId", "email role")
      .sort({ createdAt: -1 })
      .lean();

    const result = await Promise.all(
      applications.map(async (app) => {
        const rawApp = app as any;
        const candidateUserId =
          (typeof app.userId === "object" && app.userId !== null ? (app.userId as any)._id : app.userId) ||
          (typeof rawApp.applicantId === "object" && rawApp.applicantId !== null ? rawApp.applicantId._id : rawApp.applicantId) ||
          (typeof rawApp.candidateId === "object" && rawApp.candidateId !== null ? rawApp.candidateId._id : rawApp.candidateId);

        const profile = await UserProfile.findOne({
          userId: candidateUserId,
        }).lean();

        let candidateUser =
          typeof app.userId === "object" && app.userId !== null ? (app.userId as any) : null;
        if (!candidateUser && candidateUserId) {
          candidateUser = await User.findById(candidateUserId).select("email role").lean();
        }

        return {
          ...app,
          userId: candidateUserId || app.userId,
          applicantProfile: profile
            ? {
                firstName: profile.firstName,
                lastName: profile.lastName,
                profilePicture: profile.profilePicture || "",
                headline: profile.headline || "",
              }
            : {
                firstName: candidateUser?.email ? candidateUser.email.split("@")[0] : "Applicant",
                lastName: "",
                profilePicture: "",
                headline: "",
              },
        };
      })
    );

    return result;
  }

  static async getApplicationsForJob(
    recruiterId: string,
    jobId: string
  ) {
    const job = await Job.findOne({
      _id: jobId,
      userId: recruiterId,
    });

    if (!job) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        "Job not found."
      );
    }

    const applications = await Application.find({
      jobId,
    })
      .populate("userId")
      .sort({
        createdAt: -1,
      });

    for (const app of applications) {
      const candidateUserId = (app.userId as any)?._id || app.userId;
      if (candidateUserId) {
        NotificationService.createNotification({
          recipientId: candidateUserId.toString(),
          senderId: recruiterId,
          type: "APPLICATION_VIEWED",
          title: "Application Reviewed",
          message: `Your application for "${job.title}" was reviewed by the recruiter.`,
          link: "/job-seeker/applications",
        }).catch(() => null);

        User.findById(candidateUserId).then((applicantUser) => {
          if (applicantUser?.email) {
            EmailService.sendApplicationViewedToJobSeeker({
              applicantEmail: applicantUser.email,
              applicantName: applicantUser.email.split("@")[0],
              jobTitle: job.title,
            }).catch(() => null);
          }
        });
      }
    }

    return applications;
  }

  static async updateStatus(
    recruiterId: string,
    applicationId: string,
    payload: UpdateApplicationStatusInput
  ) {
    const application = await Application.findById(applicationId);

    if (!application) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        APPLICATION_MESSAGES.APPLICATION_NOT_FOUND
      );
    }

    const job = await Job.findOne({
      _id: application.jobId,
      userId: recruiterId,
    });

    if (!job) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        "You cannot update this application."
      );
    }

    const oldStatus = application.status;
    application.status = payload.status as any;
    await application.save();

    await ApplicationStatusHistory.create({
      applicationId: application._id,
      oldStatus,
      newStatus: payload.status,
      changedByUserId: recruiterId,
    }).catch(() => null);

    const candidateUser = await User.findById(application.userId);
    const candidateProfile = await UserProfile.findOne({ userId: application.userId });
    const applicantName = candidateProfile
      ? `${candidateProfile.firstName || ""} ${candidateProfile.lastName || ""}`.trim()
      : candidateUser?.email?.split("@")[0] || "Candidate";

    let title = `Application Status Updated: ${payload.status}`;
    let message = `Your application for "${job.title}" has been updated to ${payload.status}.`;

    if (payload.status === "INTERVIEW") {
      title = "Interview Invitation!";
      message = `You have been selected for an interview for "${job.title}".`;
    } else if (payload.status === "SHORTLISTED") {
      title = "Application Shortlisted!";
      message = `Great news! Your profile has been shortlisted for "${job.title}".`;
    }

    await NotificationService.createNotification({
      recipientId: application.userId.toString(),
      senderId: recruiterId,
      type: "STATUS_UPDATED",
      title,
      message,
      link: "/job-seeker/applications",
    }).catch(() => null);

    if (candidateUser?.email) {
      EmailService.sendStatusUpdateToJobSeeker({
        applicantEmail: candidateUser.email,
        applicantName,
        jobTitle: job.title,
        status: payload.status,
      }).catch((err) => console.error("Status update email failed:", err));
    }

    return application;
  }
}