import { z } from "zod";
import { ApplicationStatus } from "../../common/enums/applicationStatus.enum";

const applyJob = z.object({
  resume: z.string().url("Resume must be a valid URL."),
  coverLetter: z.string().optional(),
});

const updateStatus = z.object({
  status: z.enum(ApplicationStatus),
});

export const ApplicationValidation = {
  applyJob,
  updateStatus,
};