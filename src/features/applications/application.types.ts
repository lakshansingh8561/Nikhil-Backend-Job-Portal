import { ApplicationStatus } from "../../common/enums/applicationStatus.enum";

export interface ApplyJobInput {
  resume: string;
  coverLetter?: string;
}

export interface UpdateApplicationStatusInput {
  status: ApplicationStatus;
}