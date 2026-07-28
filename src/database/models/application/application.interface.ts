import { Document, Types } from "mongoose";
import { ApplicationStatus } from "../../../common/enums/applicationStatus.enum";

export interface IApplication extends Document {
  jobId: Types.ObjectId;

  applicantId: Types.ObjectId;

  resume: string;

  coverLetter?: string;

  status: ApplicationStatus;

  createdAt: Date;

  updatedAt: Date;
}