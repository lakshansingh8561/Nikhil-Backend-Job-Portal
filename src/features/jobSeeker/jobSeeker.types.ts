import {
  IEducation,
  IExperience,
} from "../../database/models";

export interface CreateJobSeekerProfileInput {
  firstName: string;
  lastName: string;
  phone: string;

  headline?: string;
  bio?: string;
  currentLocation?: string;

  yearsOfExperience?: number;
  expectedSalary?: number;

  skills?: string[];

  education?: IEducation[];

  experience?: IExperience[];
}

export interface UpdateJobSeekerProfileInput
  extends Partial<CreateJobSeekerProfileInput> {}

export interface JobSeekerQuery {
  search?: string;
  location?: string;
  skill?: string;
  page?: number;
  limit?: number;
}