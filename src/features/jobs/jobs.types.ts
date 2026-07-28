import { EmploymentType } from "../../common/enums/employmentType.enum";
import { ExperienceLevel } from "../../common/enums/experienceLevel.enum";

export interface CreateJobInput {
  title: string;
  description: string;
  location: string;

  salaryMin: number;
  salaryMax: number;

  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;

  skills: string[];

  vacancies: number;

  deadline: Date;
}

export interface UpdateJobInput
  extends Partial<CreateJobInput> {}

export interface JobQuery {
  search?: string;

  location?: string;

  employmentType?: EmploymentType;

  experienceLevel?: ExperienceLevel;

  page?: number;

  limit?: number;
}