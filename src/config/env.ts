import dotenv from "dotenv";
import path from "path";

// Load .env file from backend root directory
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "5000", 10),
  MONGO_URI: process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal",
  MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/job-portal",

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "jobbox_jwt_access_secret_key_change_in_production_2026",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "jobbox_jwt_refresh_secret_key_change_in_production_2026",
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_USER: process.env.EMAIL_USER || process.env.SMTP_USER || "",
  SMTP_PASS: process.env.EMAIL_PASS || process.env.SMTP_PASS || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "jobportal@example.com",

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",

  // ── Polar Sandbox Configuration ──────────────────────────────────────────
  POLAR_ACCESS_TOKEN: (process.env.POLAR_ACCESS_TOKEN || "").trim(),
  POLAR_ORGANIZATION_ID: (process.env.POLAR_ORGANIZATION_ID || "").trim(),
  POLAR_WEBHOOK_SECRET: (process.env.POLAR_WEBHOOK_SECRET || "").trim(),
  POLAR_SERVER: process.env.POLAR_SERVER || "sandbox",

  // Polar Product IDs
  POLAR_PRODUCT_ID: (process.env.POLAR_PRODUCT_ID || process.env.POLAR_PRO_PRODUCT_ID || "").trim(),
  POLAR_PRO_MONTHLY_PRODUCT_ID: (process.env.POLAR_PRO_MONTHLY_PRODUCT_ID || process.env.POLAR_PRO_PRODUCT_ID || "").trim(),
  POLAR_PRO_YEARLY_PRODUCT_ID: (process.env.POLAR_PRO_YEARLY_PRODUCT_ID || process.env.POLAR_PRO_PRODUCT_ID || "").trim(),
  POLAR_PREMIUM_MONTHLY_PRODUCT_ID: (process.env.POLAR_PREMIUM_MONTHLY_PRODUCT_ID || process.env.POLAR_PREMIUM_PRODUCT_ID || "").trim(),
  POLAR_PREMIUM_YEARLY_PRODUCT_ID: (process.env.POLAR_PREMIUM_YEARLY_PRODUCT_ID || process.env.POLAR_PREMIUM_PRODUCT_ID || "").trim(),
  POLAR_RECRUITER_PROFESSIONAL_PRODUCT_ID: (process.env.POLAR_RECRUITER_PROFESSIONAL_PRODUCT_ID || "").trim(),
  POLAR_RECRUITER_ENTERPRISE_PRODUCT_ID: (process.env.POLAR_RECRUITER_ENTERPRISE_PRODUCT_ID || "").trim(),

  // ── Razorpay Credentials ──────────────────────────────────────────────────
  RAZORPAY_KEY_ID: (process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_TEST_KEY || "").trim(),
  RAZORPAY_KEY_SECRET: (process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || "").trim(),
  RAZORPAY_WEBHOOK_SECRET: (process.env.RAZORPAY_WEBHOOK_SECRET || "whsec_test_jobbox_2026").trim(),

  // ── Razorpay Plan IDs (Read directly from your .env file) ─────────────────
  RAZORPAY_JOBSEEKER_PRO_ID: (process.env.RAZORPAY_JOBSEEKER_PRO_ID || "").trim(),
  RAZORPAY_JOBSEEKER_PREMIUM_ID: (
    process.env.RAZORPAY_JOBSEEKER_PEMIUM_ID ||
    process.env.RAZORPAY_JOBSEEKER_PREMIUM_ID ||
    ""
  ).trim(),
  RAZORPAY_RECRUITER_PROFESSIONAL_ID: (
    process.env.RAZORPAY_RECRUITER_PROFFESSIONAL_ID ||
    process.env.RAZORPAY_RECRUITER_PROFESSIONAL_ID ||
    ""
  ).trim(),
  RAZORPAY_RECRUITER_ENTERPRISE_ID: (process.env.RAZORPAY_RECRUITER_ENTERPRISE_ID || "").trim(),

  FRONTEND_URL: process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173",
  CLIENT_URL: process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173",
};
