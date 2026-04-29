import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@multicross/shared";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

let _io: AppServer | null = null;

export function setIo(io: AppServer): void {
  _io = io;
}

export async function emitToUser(
  userId: string,
  event: string,
  payload: unknown
): Promise<void> {
  if (!_io) return;
  (_io.to(`user:${userId}`) as any).emit(event, payload);
}
