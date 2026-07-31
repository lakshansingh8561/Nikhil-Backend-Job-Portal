export interface CreateRecruiterProfileInput {
  firstName: string;
  lastName: string;
  phone: string;
  designation: string;
  currentCompany?: string;
  experience?: number;
  currentLocation?: string;
  headline?: string;
  bio?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  profilePicture?: string;
}

export interface UpdateRecruiterProfileInput
  extends Partial<CreateRecruiterProfileInput> {}

export interface RecruiterQuery {
  search?: string;
  location?: string;
  letter?: string;
  page?: number;
  limit?: number;
}