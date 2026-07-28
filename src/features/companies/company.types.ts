export interface CreateCompanyInput {
  companyName: string;
  tagline?: string;
  description?: string;
  industry: string;
  companySize: string;
  website?: string;
  email: string;
  phone: string;
  foundedYear?: number;
  headquarters?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
}

export interface UpdateCompanyInput
  extends Partial<CreateCompanyInput> {}