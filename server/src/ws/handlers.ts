import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@multicross/shared";

export function registerWsHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join_room", (_payload) => {
      // TODO: Session 3 — validate, join socket room, broadcast participant_joined
    });

    socket.on("fill_cell", (_payload) => {
      // TODO: Session 3 — validate, persist to Redis, broadcast cell_updated
    });

    socket.on("move_cursor", (_payload) => {
      // TODO: Session 3 — update Redis cursor hash, broadcast cursor_moved
    });

    socket.on("leave_room", (_payload) => {
      // TODO: Session 3 — remove from Redis set, broadcast participant_left
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}
