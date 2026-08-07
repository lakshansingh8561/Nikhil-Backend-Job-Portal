import { Document, Types } from "mongoose";

export interface IEducation {
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  startDate: Date;
  endDate?: Date;
  currentlyStudying?: boolean;
}

export interface IExperience {
  company: string;
  designation: string;
  employmentType?: string;
  startDate: Date;
  endDate?: Date;
  currentlyWorking?: boolean;
  description?: string;
}

export interface IJobSeekerProfile extends Document {
  userId: Types.ObjectId;
  resumeUrl?: string;
  yearsOfExperience: number;
  expectedSalary?: number;
  noticePeriodDays?: number;
  education: IEducation[];
  experience: IExperience[];
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}