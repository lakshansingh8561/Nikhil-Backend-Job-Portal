import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import routes from "./routes";

// import routes from "./routes/index";
import { API_PREFIX } from "./common/constants/apiRoutes";
import { notFoundMiddleware } from "./common/middlewares/notFound.middleware";
import { errorMiddleware } from "./common/middlewares/error.middleware";

const app = express();

app.use(helmet());

app.use(cors());

app.use(compression());

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.use(morgan("dev"));
app.use("/api/v1", routes);

// app.use(API_PREFIX, routes);
app.use(notFoundMiddleware);

app.use(errorMiddleware);

export default app;