import { EmploymentType } from "../../common/enums/employmentType.enum";
import { ExperienceLevel } from "../../common/enums/experienceLevel.enum";

export interface CreateJobInput {
  title: string;
  description: string;
  location?: any;

  salaryMin?: number;
  salaryMax?: number;

  employmentType?: any;
  workplaceType?: string;
  jobType?: string;
  experienceLevel?: any;

  skills?: string[];
  vacancies?: number;
  deadline?: Date;
  requirements?: string;
  responsibilities?: string;
  companyId?: string;
}

export interface UpdateJobInput extends Partial<CreateJobInput> {}

export interface JobQuery {
  search?: string;
  location?: string;
  industry?: string;
  employmentType?: any;
  experienceLevel?: any;
  salaryMin?: number;
  salaryMax?: number;
  skills?: string | string[];
  page?: number;
  limit?: number;
  userId?: string;
  recruiterId?: string;
  companyId?: string;
}