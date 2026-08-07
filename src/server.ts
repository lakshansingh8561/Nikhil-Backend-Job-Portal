import http from "http";
import app from "./app";
import { env } from "./config/env";
import { connectDatabase } from "./config/database";
import { initSocketServer } from "./socket";
import { MembershipService } from "./features/memberships";

const startServer = async () => {
  try {
    await connectDatabase();
    await MembershipService.seedDefaultMemberships();

    const server = http.createServer(app);
    initSocketServer(server);

    server.listen(env.PORT, () => {
      console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();