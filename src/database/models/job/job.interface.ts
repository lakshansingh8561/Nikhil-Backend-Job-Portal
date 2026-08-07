import { Document, Types } from "mongoose";

export type WorkplaceType = "REMOTE" | "HYBRID" | "ONSITE";
export type JobType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | "FREELANCE";
export type JobStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED" | "ARCHIVED";

export interface IJobLocation {
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface IJob extends Document {
  title: string;
  description: string;
  requirements?: string;
  responsibilities?: string;
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  workplaceType: WorkplaceType;
  jobType: JobType;
  status: JobStatus;
  isActive?: boolean;
  location?: any;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  skills?: string[];
  employmentType?: string;
  experienceLevel?: string;
  deadline?: Date;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}