import { z } from "zod";

const createProfile = z.object({
  firstName: z.string().min(2).max(50),

  lastName: z.string().min(2).max(50),

  phone: z.string().min(10).max(15),

  headline: z.string().optional(),

  bio: z.string().optional(),

  currentLocation: z.string().optional(),

  yearsOfExperience: z.number().min(0).optional(),

  expectedSalary: z.number().min(0).optional(),

  skills: z.array(z.string()).optional(),

  education: z.array(z.any()).optional(),

  experience: z.array(z.any()).optional(),
});

const updateProfile = createProfile.partial();

export const JobSeekerValidation = {
  createProfile,
  updateProfile,
};