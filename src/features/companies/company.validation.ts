import { z } from "zod";

const createCompany = z.object({
  companyName: z.string().min(2).max(100),
  tagline: z.string().optional(),
  description: z.string().optional(),
  mission: z.string().optional(),
  vision: z.string().optional(),
  industry: z.string().min(2),
  companySize: z.string(),
  website: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  logo: z.string().optional(),
  coverImage: z.string().optional(),
  foundedYear: z.number().optional(),
  headquarters: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  linkedin: z.string().optional(),
  facebook: z.string().optional(),
  twitter: z.string().optional(),
  instagram: z.string().optional(),
  github: z.string().optional(),
  youtube: z.string().optional(),
  officeImages: z.array(z.string()).optional(),
});

const updateCompany = createCompany.partial();

export const CompanyValidation = {
  createCompany,
  updateCompany,
};