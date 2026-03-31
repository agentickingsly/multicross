/**
 * Mock WebSocket client.
 * Uses an in-memory event bus — no real socket connection.
 * Session 3 will replace this with socket.io-client wiring.
 */
import type { ServerToClientEvents } from "@multicross/shared";

type EventName = keyof ServerToClientEvents;
type Handler<E extends EventName> = Parameters<ServerToClientEvents[E]>[0] extends infer P
  ? (payload: P) => void
  : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers = new Map<string, Set<(payload: any) => void>>();
let connected = false;

export const ws = {
  connect(token: string): void {
    connected = true;
    console.log("[WS mock] connected (token:", token.slice(0, 12), "...)");
  },

  disconnect(): void {
    connected = false;
    handlers.clear();
    console.log("[WS mock] disconnected");
  },

  emit<E extends string>(event: E, data: unknown): void {
    console.log("[WS mock] emit →", event, data);
  },

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler as (p: unknown) => void);
    return () => {
      handlers.get(event)?.delete(handler as (p: unknown) => void);
    };
  },

  /** Test helper: trigger a server→client event locally. */
  mockReceive<E extends EventName>(event: E, payload: Parameters<ServerToClientEvents[E]>[0]): void {
    if (!connected) {
      console.warn("[WS mock] mockReceive called while disconnected:", event);
    }
    handlers.get(event)?.forEach((h) => h(payload));
  },

  get isConnected(): boolean {
    return connected;
  },
};
