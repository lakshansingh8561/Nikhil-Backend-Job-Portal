import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import { env } from "../../config/env";

const getCloudinaryInstance = () => {
  if (process.env.CLOUDINARY_URL) {
    delete process.env.CLOUDINARY_URL;
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME || "rmqcfadd",
    api_key: process.env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY || "222221271939251",
    api_secret: process.env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET || "7NWpGJpOR1RKp3mvVI5QFZRKvo0",
    secure: true,
  });
  return cloudinary;
};

export class CloudinaryService {
  /**
   * Save file buffer to local disk ('uploads/profile-images' or 'uploads/resumes')
   */
  private static async saveToLocalDisk(
    fileBuffer: Buffer,
    folderSubPath: string,
    fileName?: string
  ): Promise<{ url: string; public_id: string }> {
    const uploadDir = path.join(process.cwd(), "uploads", folderSubPath);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = fileName && fileName.includes(".")
      ? path.extname(fileName)
      : folderSubPath.includes("resumes") ? ".pdf" : ".jpg";
    const cleanFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    const filePath = path.join(uploadDir, cleanFileName);

    await fs.promises.writeFile(filePath, fileBuffer);

    const baseUrl = process.env.BASE_URL || process.env.VITE_BASE_URL || "http://localhost:5000";
    const relativeUrl = `${baseUrl}/uploads/${folderSubPath}/${cleanFileName}`;

    console.log(`✅ Saved file to local storage fallback: ${relativeUrl}`);

    return {
      url: relativeUrl,
      public_id: `local_${cleanFileName}`,
    };
  }

  /**
   * Upload profile image directly to Cloudinary folder 'Job-portal/Profile-Images'
   */
  static async uploadProfileImage(
    fileBuffer: Buffer,
    fileName?: string
  ): Promise<{ url: string; public_id: string }> {
    const instance = getCloudinaryInstance();

    return new Promise((resolve) => {
      const uploadStream = instance.uploader.upload_stream(
        {
          folder: "Job-portal/Profile-Images",
          resource_type: "image",
          type: "upload",
          use_filename: true,
          unique_filename: true,
        },
        async (error, result) => {
          if (error || !result) {
            console.warn("⚠️ Cloudinary upload returned error:", error?.message || error);
            console.log("ℹ️ Falling back to local storage so profile photo displays instantly...");
            const fallback = await CloudinaryService.saveToLocalDisk(fileBuffer, "profile-images", fileName);
            return resolve(fallback);
          }
          console.log("🎉 Cloudinary Profile Image uploaded successfully:", result.secure_url);
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        }
      );

      Readable.from(fileBuffer).pipe(uploadStream);
    });
  }

  /**
   * Upload resume directly to Cloudinary folder 'Job-portal/resumes'
   */
  static async uploadResume(
    fileBuffer: Buffer,
    fileName?: string
  ): Promise<{ url: string; public_id: string }> {
    const instance = getCloudinaryInstance();

    return new Promise((resolve) => {
      const uploadStream = instance.uploader.upload_stream(
        {
          folder: "Job-portal/resumes",
          resource_type: "raw",
          type: "upload",
          use_filename: true,
          unique_filename: true,
        },
        async (error, result) => {
          if (error || !result) {
            console.warn("⚠️ Cloudinary resume upload returned error:", error?.message || error);
            console.log("ℹ️ Falling back to local storage so resume PDF displays instantly...");
            const fallback = await CloudinaryService.saveToLocalDisk(fileBuffer, "resumes", fileName);
            return resolve(fallback);
          }
          console.log("🎉 Cloudinary Resume uploaded successfully:", result.secure_url);
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        }
      );

      Readable.from(fileBuffer).pipe(uploadStream);
    });
  }

  /**
   * Delete asset by public_id
   */
  static async deleteFile(publicId: string): Promise<boolean> {
    try {
      if (publicId.startsWith("local_")) {
        return true;
      }
      const instance = getCloudinaryInstance();
      const res = await instance.uploader.destroy(publicId);
      return res.result === "ok";
    } catch (err) {
      console.error("Cloudinary delete error:", err);
      return false;
    }
  }
}

export default CloudinaryService;
