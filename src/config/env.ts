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

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "rmqcfadd",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "222221271939251",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "7NWpGJpOR1RKp3mvVI5QFZRKvo0",
};