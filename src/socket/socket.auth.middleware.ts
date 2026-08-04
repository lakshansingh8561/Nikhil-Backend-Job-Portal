import { Socket } from "socket.io";
import { verifyAccessToken } from "../common/utils/jwt";
import { User } from "../database/models";
import { Role, UserStatus } from "../common/enums";

export interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    role: Role;
    email: string;
  };
}

export const socketAuthMiddleware = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.userId);
    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    if (user.status === UserStatus.BLOCKED) {
      return next(new Error("Authentication error: User account is blocked"));
    }

    if (user.role === Role.ADMIN) {
      return next(
        new Error(
          "Authentication error: Admins cannot participate in chat conversations"
        )
      );
    }

    socket.user = {
      userId: user.id,
      role: user.role,
      email: user.email,
    };

    next();
  } catch (error: any) {
    return next(new Error(`Authentication error: ${error.message || "Invalid token"}`));
  }
};
