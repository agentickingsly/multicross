import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@multicross/shared";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

let _io: AppServer | null = null;

export function setIo(io: AppServer): void {
  _io = io;
}
