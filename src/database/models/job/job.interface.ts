import { Document, Types } from "mongoose";
import { EmploymentType } from "../../../common/enums/employmentType.enum";
import { ExperienceLevel } from "../../../common/enums/experienceLevel.enum";

export interface IJob extends Document {
  title: string;

  description: string;

  companyId: Types.ObjectId;

  recruiterId: Types.ObjectId;

  location: string;

  salaryMin: number;

  salaryMax: number;

  employmentType: EmploymentType;

  experienceLevel: ExperienceLevel;

  skills: string[];

  vacancies: number;

  deadline: Date;

  isActive: boolean;

  createdAt: Date;

  updatedAt: Date;
}