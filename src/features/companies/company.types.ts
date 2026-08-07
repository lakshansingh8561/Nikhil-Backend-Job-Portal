export interface CreateCompanyInput {
  name: string;
  companyName?: string;
  description?: string;
  industry?: string;
  companySize?: string;
  website?: string;
  email?: string;
  phone?: string;
  logo?: string;
  coverImage?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    github?: string;
    facebook?: string;
    website?: string;
  };
}

export interface UpdateCompanyInput
  extends Partial<CreateCompanyInput> {}