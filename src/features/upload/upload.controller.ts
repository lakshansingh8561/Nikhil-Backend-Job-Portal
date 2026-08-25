import { Request, Response, NextFunction } from "express";
import { CloudinaryService } from "../../common/services/cloudinary.service";
import { ApiResponse } from "../../common/utils/ApiResponse";
import { ApiError } from "../../common/utils/ApiError";
import { UserProfile, JobSeekerProfile } from "../../database/models";
import { MediaType } from "../../common/enums/postVisibility.enum";

const ALLOWED_POST_MIME_PREFIXES = ["image/", "video/"];
const ALLOWED_POST_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

const isAllowedPostMime = (mimeType: string): boolean =>
  ALLOWED_POST_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) ||
  ALLOWED_POST_MIME_TYPES.includes(mimeType);

const resolveMediaType = (mimeType: string): MediaType => {
  if (mimeType.startsWith("image/")) return MediaType.IMAGE;
  if (mimeType.startsWith("video/")) return MediaType.VIDEO;
  return MediaType.DOCUMENT;
};


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

  /**
   * Batch upload of post attachments -> 'Job-portal/Posts'
   *
   * Accepts up to 10 files in one request and returns media descriptors shaped
   * exactly like `IPostMedia`, so the composer can hand the response straight
   * to `POST /posts` without remapping.
   */
  static uploadPostMedia = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      if (files.length === 0) {
        throw new ApiError(400, "Please select at least one file to upload");
      }

      const rejected = files.find((file) => !isAllowedPostMime(file.mimetype));
      if (rejected) {
        throw new ApiError(
          400,
          `"${rejected.originalname}" is not a supported attachment type. Upload images, videos, PDFs or Office documents.`
        );
      }

      const media = await Promise.all(
        files.map(async (file) => {
          const result = await CloudinaryService.uploadPostMedia(
            file.buffer,
            file.originalname,
            file.mimetype
          );

          return {
            url: result.url,
            publicId: result.public_id,
            type: resolveMediaType(file.mimetype),
            mimeType: file.mimetype,
            fileName: file.originalname,
            bytes: result.bytes ?? file.size,
            width: result.width ?? 0,
            height: result.height ?? 0,
          };
        })
      );

      return res
        .status(200)
        .json(new ApiResponse(true, "Attachments uploaded successfully", { media }));
    } catch (err) {
      next(err);
    }
  };
}
