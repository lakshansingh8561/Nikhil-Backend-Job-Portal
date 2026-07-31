import { z } from "zod";

const createProfile = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  phone: z.string().min(10).max(15),
  designation: z.string().min(2).max(100),
  currentCompany: z.string().optional(),
  experience: z.number().min(0).optional(),
  currentLocation: z.string().optional(),
  headline: z.string().optional(),
  bio: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),
  profilePicture: z.string().optional(),
});

const updateProfile = createProfile.partial();

export const RecruiterValidation = {
  createProfile,
  updateProfile,
};