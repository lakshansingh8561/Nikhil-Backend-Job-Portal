export interface CreateRecruiterProfileInput {
  firstName: string;
  lastName: string;
  phone: string;
  designation: string;
  linkedin?: string;
  profilePicture?: string;
}

export interface UpdateRecruiterProfileInput
  extends Partial<CreateRecruiterProfileInput> {}