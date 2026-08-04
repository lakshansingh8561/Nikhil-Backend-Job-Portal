import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { socketAuthMiddleware } from "./socket.auth.middleware";
import { setupSocketHandlers } from "./socket.handler";

let io: SocketServer | null = null;

export const initSocketServer = (httpServer: HttpServer): SocketServer => {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://nikhil-frontend-job-portal.vercel.app",
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
  ].filter(Boolean) as string[];

  io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
          callback(null, true);
        } else {
          callback(null, true);
        }
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  // Apply authentication middleware
  io.use(socketAuthMiddleware);

  // Setup event handlers
  setupSocketHandlers(io);

  console.log("⚡ Socket.IO server initialized successfully");
  return io;
};

export const getIO = (): SocketServer => {
  if (!io) {
    throw new Error("Socket.IO not initialized! Call initSocketServer first.");
  }
  return io;
};
