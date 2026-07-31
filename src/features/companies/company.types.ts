export interface CreateCompanyInput {
  companyName: string;
  tagline?: string;
  description?: string;
  mission?: string;
  vision?: string;
  industry: string;
  companySize: string;
  website?: string;
  email?: string;
  phone?: string;
  logo?: string;
  coverImage?: string;
  foundedYear?: number;
  headquarters?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin?: string;
  facebook?: string;
  twitter?: string;
  instagram?: string;
  github?: string;
  youtube?: string;
  officeImages?: string[];
}

export interface UpdateCompanyInput
  extends Partial<CreateCompanyInput> {}