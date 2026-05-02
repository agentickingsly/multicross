import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@multicross/shared";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type EventName = keyof ServerToClientEvents;
type Handler<E extends EventName> = Parameters<ServerToClientEvents[E]>[0] extends infer P
  ? (payload: P) => void
  : never;

interface PendingEntry {
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => void;
}

let socket: AppSocket | null = null;
// Listeners registered before connect() is called are queued here and drained
// onto the socket in the order they were registered once connect() runs.
const pendingListeners: PendingEntry[] = [];

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
    for (const { event, handler } of pendingListeners) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on(event as any, handler);
    }
    pendingListeners.length = 0;
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
    if (!socket) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry: PendingEntry = { event: event as string, handler: handler as (...args: any[]) => void };
      pendingListeners.push(entry);
      return () => {
        const idx = pendingListeners.indexOf(entry);
        if (idx !== -1) {
          // Still pending — remove before it's ever registered
          pendingListeners.splice(idx, 1);
        } else {
          // Already drained onto the socket
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          socket?.off(event as any, handler as any);
        }
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on(event as any, handler as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket?.off(event as any, handler as any);
    };
  },

  onConnect(handler: () => void): () => void {
    if (socket?.connected) handler();
    socket?.on("connect", handler);
    return () => socket?.off("connect", handler);
  },

  get isConnected(): boolean {
    return socket?.connected ?? false;
  },
};
