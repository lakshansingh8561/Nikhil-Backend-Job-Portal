import { z } from "zod";

const createJob = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(120),
  description: z.string().min(10, "Description must be at least 10 characters"),
  location: z.any().optional(),
  salaryMin: z.coerce.number().optional().default(0),
  salaryMax: z.coerce.number().optional().default(0),
  employmentType: z.string().optional().default("FULL_TIME"),
  workplaceType: z.string().optional().default("ONSITE"),
  jobType: z.string().optional().default("FULL_TIME"),
  experienceLevel: z.string().optional().default("Mid-Level"),
  skills: z
    .union([z.array(z.string()), z.string()])
    .transform((val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === "string") return val.split(",").map((s) => s.trim()).filter(Boolean);
      return [];
    })
    .optional()
    .default([]),
  vacancies: z.coerce.number().optional().default(1),
  deadline: z.coerce.date().optional(),
  requirements: z.string().optional().default(""),
  responsibilities: z.string().optional().default(""),
  companyId: z.string().optional(),
});

const updateJob = createJob.partial();

export const JobValidation = {
  createJob,
  updateJob,
};