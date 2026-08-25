import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import routes from "./routes";

import { notFoundMiddleware } from "./common/middlewares/notFound.middleware";
import { errorMiddleware } from "./common/middlewares/error.middleware";

const app = express();

// Helmet's default `Cross-Origin-Resource-Policy: same-origin` blocks the
// browser at :5173 from loading locally-stored media served from :5000, which
// silently broke every image that fell back to disk instead of Cloudinary.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://nikhil-frontend-job-portal.vercel.app",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        callback(null, true); // Allow origin in production fallback
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  express.json({
    verify: (req, res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 Job Portal Backend is running successfully on Vercel!",
  });
});

import path from "path";

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/v1", routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;