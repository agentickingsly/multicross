import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@multicross/shared";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type EventName = keyof ServerToClientEvents;
type Handler<E extends EventName> = Parameters<ServerToClientEvents[E]>[0] extends infer P
  ? (payload: P) => void
  : never;

let socket: AppSocket | null = null;

export const ws = {
  connect(token: string): void {
    if (socket?.connected) return;
    socket = io(import.meta.env.VITE_API_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    }) as AppSocket;
    socket.on("connect_error", (err) => {
      console.error("[WS] connect_error:", err.message);
    });
    socket.on("disconnect", (reason) => {
      console.log("[WS] disconnected:", reason);
    });
  },

  disconnect(): void {
    socket?.disconnect();
    socket = null;
  },

  emit<E extends keyof ClientToServerEvents>(
    event: E,
    data: Parameters<ClientToServerEvents[E]>[0]
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any)?.emit(event, data);
  },

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket?.on(event as any, handler as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket?.off(event as any, handler as any);
    };
  },

  onConnect(handler: () => void): () => void {
    socket?.on("connect", handler);
    return () => socket?.off("connect", handler);
  },

  get isConnected(): boolean {
    return socket?.connected ?? false;
  },
};
