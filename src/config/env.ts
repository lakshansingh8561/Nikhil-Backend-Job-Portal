import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: process.env.PORT || 5000,

  MONGODB_URI:
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb+srv://user:pass@cluster.mongodb.net/jobbox?retryWrites=true&w=majority",

  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ||
    "jobbox_jwt_access_secret_key_change_in_production_2026",

  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ||
    "jobbox_jwt_refresh_secret_key_change_in_production_2026",

  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || "15m",

  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  CLIENT_URL: process.env.CLIENT_URL || process.env.CORS_ORIGIN || "http://localhost:5173",

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  // ── Polar ─────────────────────────────────────────────────────────────────
  POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
  /** Legacy single-product ID kept for backward compat */
  POLAR_PRODUCT_ID: process.env.POLAR_PRODUCT_ID,
  POLAR_SERVER: (process.env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
  POLAR_WEBHOOK_SECRET: (process.env.POLAR_WEBHOOK_SECRET || "").trim(),
  /** Recurring product IDs — create these in Polar dashboard */
  POLAR_PRO_MONTHLY_PRODUCT_ID: process.env.POLAR_PRO_MONTHLY_PRODUCT_ID || process.env.POLAR_PRO_PRODUCT_ID || "",
  POLAR_PRO_YEARLY_PRODUCT_ID: process.env.POLAR_PRO_YEARLY_PRODUCT_ID || process.env.POLAR_PRO_PRODUCT_ID || "",
  POLAR_PREMIUM_MONTHLY_PRODUCT_ID: process.env.POLAR_PREMIUM_MONTHLY_PRODUCT_ID || process.env.POLAR_PREMIUM_PRODUCT_ID || "",
  POLAR_PREMIUM_YEARLY_PRODUCT_ID: process.env.POLAR_PREMIUM_YEARLY_PRODUCT_ID || process.env.POLAR_PREMIUM_PRODUCT_ID || "",
  POLAR_RECRUITER_PROFESSIONAL_PRODUCT_ID: (process.env.POLAR_RECRUITER_PROFESSIONAL_PRODUCT_ID || "").trim(),
  POLAR_RECRUITER_ENTERPRISE_PRODUCT_ID: (process.env.POLAR_RECRUITER_ENTERPRISE_PRODUCT_ID || "").trim(),
  // ── Razorpay ──────────────────────────────────────────────────────────────
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_TEST_KEY || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "whsec_test_jobbox_2026",
  /** Subscription plan IDs — create these in Razorpay dashboard */
  RAZORPAY_PRO_MONTHLY_PLAN_ID: process.env.RAZORPAY_PRO_MONTHLY_PLAN_ID || "",
  RAZORPAY_PRO_YEARLY_PLAN_ID: process.env.RAZORPAY_PRO_YEARLY_PLAN_ID || "",
  RAZORPAY_PREMIUM_MONTHLY_PLAN_ID: process.env.RAZORPAY_PREMIUM_MONTHLY_PLAN_ID || "",
  RAZORPAY_PREMIUM_YEARLY_PLAN_ID: process.env.RAZORPAY_PREMIUM_YEARLY_PLAN_ID || "",

  FRONTEND_URL: process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173",
};
