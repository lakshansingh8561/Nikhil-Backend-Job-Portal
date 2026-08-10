import { Request, Response, NextFunction } from "express";
import { CloudinaryService } from "../../common/services/cloudinary.service";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { ApiError } from "../../common/utils/ApiError";
import { UserProfile, JobSeekerProfile } from "../../database/models";

export class UploadController {
  /**
   * Upload Profile Image / Avatar / Logo -> 'Job-portal/Profile-Images'
   */
  static uploadProfileImage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.file) {
        throw new ApiError(400, "Please select an image file to upload");
      }

      const result = await CloudinaryService.uploadProfileImage(
        req.file.buffer,
        req.file.originalname
      );

      // Auto update UserProfile and JobSeekerProfile in MongoDB
      const userId = (req as any).user?.userId || (req as any).user?.id;
      if (userId) {
        await UserProfile.findOneAndUpdate(
          { userId },
          { $set: { profilePicture: result.url } },
          { new: true, upsert: true }
        );
        await JobSeekerProfile.findOneAndUpdate(
          { userId },
          { $set: { profilePicture: result.url } },
          { new: true }
        );
      }

      return res.status(200).json(
        new ApiResponse(
          true,
          "Profile image uploaded successfully to Cloudinary (Job-portal/Profile-Images)",
          {
            url: result.url,
            public_id: result.public_id,
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
          }
        )
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * Upload Resume / PDF Document -> 'Job-portal/resumes'
   */
  static uploadResume = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.file) {
        throw new ApiError(400, "Please select a resume file (PDF/DOC) to upload");
      }

      const result = await CloudinaryService.uploadResume(
        req.file.buffer,
        req.file.originalname
      );

      return res.status(200).json(
        new ApiResponse(
          true,
          "Resume uploaded successfully to Cloudinary (Job-portal/resumes)",
          {
            url: result.url,
            public_id: result.public_id,
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
          }
        )
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * General Media / Chat Attachment Upload -> Auto routes images to Profile-Images & documents to resumes
   */
  static uploadGeneralFile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.file) {
        throw new ApiError(400, "Please select a file to upload");
      }

      const isImage = req.file.mimetype.startsWith("image/");
      const result = isImage
        ? await CloudinaryService.uploadProfileImage(req.file.buffer, req.file.originalname)
        : await CloudinaryService.uploadResume(req.file.buffer, req.file.originalname);

      return res.status(200).json(
        new ApiResponse(
          true,
          `File uploaded successfully to Cloudinary (${isImage ? "Job-portal/Profile-Images" : "Job-portal/resumes"})`,
          {
            url: result.url,
            public_id: result.public_id,
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
          }
        )
      );
    } catch (err) {
      next(err);
    }
  };
}
