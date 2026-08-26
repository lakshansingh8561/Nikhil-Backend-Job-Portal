import { Request, Response, NextFunction } from "express";
import { AIService } from "./ai.service";
import { JobService } from "../jobs";
import { JobSeekerService } from "../jobSeeker";

export class AIController {
  /**
   * POST /api/v1/ai/parse-resume
   * Upload PDF resume file or pass raw text to parse candidate profile
   */
  public static async parseResume(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let parsedData;

      if (req.file) {
        parsedData = await AIService.parseResumeBuffer(req.file.buffer, req.file.path);
      } else if (req.body.text) {
        parsedData = await AIService.parseResumeText(req.body.text);
      } else {
        res.status(400).json({
          success: false,
          message: "Please upload a PDF resume file or provide text.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Resume parsed successfully!",
        data: parsedData,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ai/analyze-match
   * Analyze ATS match score between a Job and Candidate Profile
   */
  public static async analyzeMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId, candidateProfile } = req.body;

      let jobData: any = req.body.jobData;
      if (jobId && !jobData) {
        try {
          jobData = await JobService.getJobById(jobId);
        } catch (e) {
          // If job not found by ID, handle below
        }
      }

      if (!jobData) {
        res.status(400).json({
          success: false,
          message: "Job details are required for ATS match analysis.",
        });
        return;
      }

      let profile = candidateProfile;
      const currentUser = (req as any).user;
      if (!profile && currentUser && currentUser.userId) {
        try {
          profile = await JobSeekerService.getProfile(currentUser.userId);
        } catch (e) {
          // Ignore if profile fetch fails
        }
      }

      if (!profile) {
        profile = {
          headline: "Job Seeker",
          summary: "",
          skills: [],
        };
      }

      const matchResult = await AIService.analyzeMatch(
        {
          title: jobData.title,
          description: jobData.description || "",
          skills: jobData.skills || [],
          requirements: jobData.requirements || "",
        },
        {
          headline: profile.headline || profile.title,
          summary: profile.summary || profile.about,
          skills: profile.skills || [],
          experience: profile.experience,
          education: profile.education,
        }
      );

      res.status(200).json({
        success: true,
        message: "ATS Match analysis generated successfully!",
        data: matchResult,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ai/generate-job-description
   * Generate Job Description for Recruiters
   */
  public static async generateJobDescription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, department, jobType, workplaceType, experienceLevel, keySkills, companyName } = req.body;

      if (!title) {
        res.status(400).json({
          success: false,
          message: "Job Title is required to generate job description.",
        });
        return;
      }

      const generated = await AIService.generateJobDescription({
        title,
        department,
        jobType,
        workplaceType,
        experienceLevel,
        keySkills: Array.isArray(keySkills) ? keySkills : (keySkills ? keySkills.split(",") : []),
        companyName,
      });

      res.status(200).json({
        success: true,
        message: "Job description generated with AI successfully!",
        data: generated,
      });
    } catch (error: any) {
      next(error);
    }
  }
}
