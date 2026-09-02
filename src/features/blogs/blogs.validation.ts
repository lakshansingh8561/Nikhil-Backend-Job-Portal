import { z } from "zod";

export const createBlogSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(250, "Title cannot exceed 250 characters"),
  excerpt: z
    .string()
    .min(10, "Excerpt must be at least 10 characters")
    .max(500, "Excerpt cannot exceed 500 characters"),
  content: z
    .string()
    .min(20, "Content must be at least 20 characters"),
  category: z.string().min(2, "Category is required"),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  status: z.enum(["draft", "published"]).optional().default("draft"),
});

export const updateBlogSchema = z.object({
  title: z.string().min(3).max(250).optional(),
  excerpt: z.string().min(10).max(500).optional(),
  content: z.string().min(20).optional(),
  category: z.string().min(2).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  status: z.enum(["draft", "published"]).optional(),
});
