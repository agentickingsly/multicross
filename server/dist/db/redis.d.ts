import Redis from "ioredis";
declare const redis: Redis;
export declare const pub: Redis;
export declare const sub: Redis;
export default redis;
export interface CellState {
    value: string;
    filledBy: string;
}
/** Returns raw hash of all filled cells. Keys are "{row}:{col}", values are JSON strings. */
export declare function getGameState(gameId: string): Promise<Record<string, string>>;
/** Upserts or deletes a cell in the game state hash. */
export declare function setCell(gameId: string, row: number, col: number, value: string, filledBy: string): Promise<void>;
export declare function getCursors(gameId: string): Promise<Record<string, {
    row: number;
    col: number;
}>>;
export declare function setCursor(gameId: string, userId: string, row: number, col: number): Promise<void>;
export declare function addParticipant(gameId: string, userId: string): Promise<void>;
export declare function removeParticipant(gameId: string, userId: string): Promise<void>;
export declare function getParticipants(gameId: string): Promise<string[]>;
export declare function deleteGameKeys(gameId: string): Promise<void>;
