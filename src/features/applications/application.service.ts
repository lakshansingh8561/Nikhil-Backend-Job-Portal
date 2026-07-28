import {
  Application,
  Job,
  JobSeekerProfile,
} from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { APPLICATION_MESSAGES } from "./application.constants";
import {
  ApplyJobInput,
  UpdateApplicationStatusInput,
} from "./application.types";

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

    const job = await Job.findById(jobId);

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

    return Application.find({
      jobId,
    })
      .populate("applicantId")
      .sort({
        createdAt: -1,
      });
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

    return application;
  }
}