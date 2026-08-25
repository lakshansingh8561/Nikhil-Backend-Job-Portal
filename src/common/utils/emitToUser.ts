import { getIO } from "../../socket/socket.server";

/**
 * Fire-and-forget emit into a user's personal socket room.
 *
 * `getIO()` throws when the socket server was never initialised (serverless
 * deployments import the app without booting an HTTP server), so every call is
 * guarded. A missing socket layer must never fail the HTTP request that
 * triggered the notification.
 */
export const emitToUser = (userId: string, event: string, payload: unknown): void => {
  try {
    if (!userId) return;
    getIO().to(`user:${userId}`).emit(event, payload);
  } catch {
    // Socket server unavailable — realtime is best-effort only.
  }
};

/** Same as `emitToUser` but for a batch of recipients, de-duplicated. */
export const emitToUsers = (userIds: Array<string | undefined | null>, event: string, payload: unknown): void => {
  const unique = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  for (const id of unique) {
    emitToUser(id, event, payload);
  }
};

/** Broadcast to every connected client — used for public feed additions. */
export const emitBroadcast = (event: string, payload: unknown): void => {
  try {
    getIO().emit(event, payload);
  } catch {
    // Socket server unavailable — realtime is best-effort only.
  }
};
