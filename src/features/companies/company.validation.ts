import { z } from "zod";

const createCompany = z.object({
  companyName: z.string().min(2).max(100),

  tagline: z.string().optional(),

  description: z.string().optional(),

  industry: z.string().min(2),

  companySize: z.string(),

  website: z.string().url().optional(),

  email: z.string().email(),

  phone: z.string().min(10).max(15),

  foundedYear: z.number().optional(),

  headquarters: z.string().optional(),

  city: z.string().optional(),

  state: z.string().optional(),

  country: z.string().optional(),

  linkedin: z.string().url().optional(),

  twitter: z.string().url().optional(),

  facebook: z.string().url().optional(),
});

const updateCompany = createCompany.partial();

export const CompanyValidation = {
  createCompany,
  updateCompany,
};