import { z } from "zod";

const createProfile = z.object({
  firstName: z.string().min(2).max(50),

  lastName: z.string().min(2).max(50),

  phone: z.string().min(10).max(15),

  designation: z.string().min(2).max(100),

  linkedin: z.string().url().optional(),

  profilePicture: z.string().optional(),
});

const updateProfile = createProfile.partial();

export const RecruiterValidation = {
  createProfile,
  updateProfile,
};