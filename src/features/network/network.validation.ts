import { z } from "zod";

const educationItem = z.object({
  institution: z.string().min(1, "Institution is required"),
  degree: z.string().min(1, "Degree is required"),
  fieldOfStudy: z.string().optional().default(""),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  currentlyStudying: z.boolean().optional().default(false),
});

const experienceItem = z.object({
  company: z.string().min(1, "Company is required"),
  designation: z.string().min(1, "Title is required"),
  employmentType: z.string().optional().default("FULL_TIME"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  currentlyWorking: z.boolean().optional().default(false),
  description: z.string().max(2000).optional().default(""),
});

const updateMyProfile = z.object({
  firstName: z.string().max(60).optional(),
  lastName: z.string().max(60).optional(),
  headline: z.string().max(220).optional(),
  bio: z.string().max(2600).optional(),
  phone: z.string().max(30).optional(),
  profilePicture: z.string().optional(),
  coverPhoto: z.string().optional(),
  skills: z.array(z.string().max(60)).max(50).optional(),
  location: z
    .object({
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .partial()
    .optional(),
  socialLinks: z
    .object({
      linkedin: z.string().optional(),
      github: z.string().optional(),
      twitter: z.string().optional(),
      website: z.string().optional(),
      portfolio: z.string().optional(),
    })
    .partial()
    .optional(),
  designation: z.string().max(120).optional(),
  currentCompany: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  yearsOfExperience: z.coerce.number().min(0).max(70).optional(),
  education: z.array(educationItem).max(20).optional(),
  experience: z.array(experienceItem).max(30).optional(),
});

const sendInvite = z.object({
  recipientId: z.string().min(1, "Recipient is required"),
  message: z.string().max(300, "Notes are limited to 300 characters").optional().default(""),
});

export const NetworkValidation = {
  updateMyProfile,
  sendInvite,
};
