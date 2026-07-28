import { z } from "zod";

const createJob = z.object({
  title: z.string().min(3).max(100),

  description: z.string().min(20),

  location: z.string().min(2),

  salaryMin: z.number(),

  salaryMax: z.number(),

  employmentType: z.string(),

  experienceLevel: z.string(),

  skills: z.array(z.string()),

  vacancies: z.number().min(1),

  deadline: z.coerce.date(),
});

const updateJob = createJob.partial();

export const JobValidation = {
  createJob,
  updateJob,
};