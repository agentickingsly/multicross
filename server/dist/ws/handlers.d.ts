import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@multicross/shared";
type CrosswordServer = Server<ClientToServerEvents, ServerToClientEvents>;
export declare function registerWsHandlers(io: CrosswordServer): void;
export {};
