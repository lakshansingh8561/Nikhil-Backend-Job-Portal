import {
  Application,
  Job,
  JobSeekerProfile,
  User,
} from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { APPLICATION_MESSAGES } from "./application.constants";
import {
  ApplyJobInput,
  UpdateApplicationStatusInput,
} from "./application.types";
import { NotificationService } from "../notifications/notification.service";
import { EmailService } from "../../common/services/email.service";

export class ApplicationService {
  static async applyJob(
    userId: string,
    jobId: string,
    payload: ApplyJobInput
  ) {
    const profile = await JobSeekerProfile.findOne({
      userId,
    });

    if (!profile) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Please complete your Job Seeker profile."
      );
    }

    const job = await Job.findById(jobId).populate("companyId");

    if (!job || !job.isActive) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        APPLICATION_MESSAGES.JOB_CLOSED
      );
    }

    if (job.deadline < new Date()) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        APPLICATION_MESSAGES.JOB_CLOSED
      );
    }

    const alreadyApplied = await Application.findOne({
      jobId,
      applicantId: userId,
    });

    if (alreadyApplied) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        APPLICATION_MESSAGES.APPLICATION_ALREADY_EXISTS
      );
    }

    const application = await Application.create({
      jobId,
      applicantId: userId,
      resume: payload.resume,
      coverLetter: payload.coverLetter,
    });

    const applicantUser = await User.findById(userId);
    const applicantFullName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || applicantUser?.email?.split("@")[0] || "Candidate";
    const companyName = (job.companyId as any)?.companyName || "Hiring Company";

    // 1. Send confirmation email to Job Seeker (Applicant)
    if (applicantUser?.email) {
      EmailService.sendApplicationConfirmationToJobSeeker({
        applicantEmail: applicantUser.email,
        applicantName: applicantFullName,
        jobTitle: job.title,
        companyName,
      }).catch((err) => console.error("Job seeker confirmation email failed:", err));
    }

    // 2. Notify Recruiter via in-app Notification & SMTP Email
    if (job.recruiterId) {
      const recruiterUser = await User.findById(job.recruiterId);

      await NotificationService.createNotification({
        recipientId: job.recruiterId.toString(),
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
      applicantId: userId,
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
    const recruiterJobs = await Job.find({ recruiterId }).select("_id");
    const jobIds = recruiterJobs.map((j) => j._id);

    const applications = await Application.find({ jobId: { $in: jobIds } })
      .populate("jobId", "title location companyId")
      .populate("applicantId", "email role")
      .sort({ createdAt: -1 })
      .lean();

    const result = await Promise.all(
      applications.map(async (app) => {
        const applicantUserId =
          typeof app.applicantId === "object" && app.applicantId !== null
            ? (app.applicantId as any)._id
            : app.applicantId;

        const profile = await JobSeekerProfile.findOne({
          userId: applicantUserId,
        }).lean();

        const applicantUser =
          typeof app.applicantId === "object" && app.applicantId !== null
            ? (app.applicantId as any)
            : null;

        return {
          ...app,
          applicantProfile: profile
            ? {
                firstName: profile.firstName,
                lastName: profile.lastName,
                profilePicture: profile.profilePicture || "",
                headline: profile.headline || "",
              }
            : {
                firstName: applicantUser?.email ? applicantUser.email.split("@")[0] : "Applicant",
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
      recruiterId,
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
      .populate("applicantId")
      .sort({
        createdAt: -1,
      });

    // Notify candidates that their application was viewed by recruiter (In-app + Email)
    for (const app of applications) {
      const applicantUserId = app.applicantId?._id || app.applicantId;
      if (applicantUserId) {
        NotificationService.createNotification({
          recipientId: applicantUserId.toString(),
          senderId: recruiterId,
          type: "APPLICATION_VIEWED",
          title: "Application Reviewed",
          message: `Your application for "${job.title}" was reviewed by the recruiter.`,
          link: "/job-seeker/applications",
        }).catch(() => null);

        User.findById(applicantUserId).then((applicantUser) => {
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
    const application =
      await Application.findById(applicationId);

    if (!application) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        APPLICATION_MESSAGES.APPLICATION_NOT_FOUND
      );
    }

    const job = await Job.findOne({
      _id: application.jobId,
      recruiterId,
    });

    if (!job) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        "You cannot update this application."
      );
    }

    application.status = payload.status;
    await application.save();

    // Fetch candidate details for notification and email
    const applicantUser = await User.findById(application.applicantId);
    const applicantProfile = await JobSeekerProfile.findOne({ userId: application.applicantId });
    const applicantName = applicantProfile
      ? `${applicantProfile.firstName || ""} ${applicantProfile.lastName || ""}`.trim() || applicantUser?.email?.split("@")[0] || "Candidate"
      : applicantUser?.email?.split("@")[0] || "Candidate";

    // Notify Job Seeker about status update!
    let title = `Application Status Updated: ${payload.status}`;
    let message = `Your application for "${job.title}" has been updated to ${payload.status}.`;

    if (payload.status === "INTERVIEW") {
      title = "Interview Invitation!";
      message = `You have been selected for an interview for "${job.title}". Please prepare and check your application details.`;
    } else if (payload.status === "SHORTLISTED") {
      title = "Application Shortlisted!";
      message = `Great news! Your profile has been shortlisted for "${job.title}".`;
    } else if (payload.status === "HIRED") {
      title = "Congratulations! You're Hired!";
      message = `Congratulations! The hiring team selected you for "${job.title}".`;
    } else if (payload.status === "REJECTED") {
      title = "Application Update";
      message = `Thank you for applying. Unfortunately, your application for "${job.title}" was not selected at this time.`;
    }

    await NotificationService.createNotification({
      recipientId: application.applicantId.toString(),
      senderId: recruiterId,
      type: "STATUS_UPDATED",
      title,
      message,
      link: "/job-seeker/applications",
    }).catch(() => null);

    if (applicantUser?.email) {
      EmailService.sendStatusUpdateToJobSeeker({
        applicantEmail: applicantUser.email,
        applicantName,
        jobTitle: job.title,
        status: payload.status,
      }).catch((err) => console.error("Status update email failed:", err));
    }

    return application;
  }
}