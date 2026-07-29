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

app.use(helmet());

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://nikhil-frontend-job-portal.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 Job Portal Backend is running successfully on Vercel!",
  });
});

app.use("/api/v1", routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;