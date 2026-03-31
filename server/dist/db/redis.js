"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sub = exports.pub = void 0;
exports.getGameState = getGameState;
exports.setCell = setCell;
exports.getCursors = getCursors;
exports.setCursor = setCursor;
exports.addParticipant = addParticipant;
exports.removeParticipant = removeParticipant;
exports.getParticipants = getParticipants;
exports.deleteGameKeys = deleteGameKeys;
const ioredis_1 = __importDefault(require("ioredis"));
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
// General-purpose client for reads/writes
const redis = new ioredis_1.default(REDIS_URL);
// Separate pub/sub clients — ioredis requires dedicated instances for subscribe mode
exports.pub = new ioredis_1.default(REDIS_URL);
exports.sub = new ioredis_1.default(REDIS_URL);
exports.default = redis;
/** Returns raw hash of all filled cells. Keys are "{row}:{col}", values are JSON strings. */
async function getGameState(gameId) {
    return (await redis.hgetall(`game:${gameId}:state`)) ?? {};
}
/** Upserts or deletes a cell in the game state hash. */
async function setCell(gameId, row, col, value, filledBy) {
    const field = `${row}:${col}`;
    if (value === "") {
        await redis.hdel(`game:${gameId}:state`, field);
    }
    else {
        await redis.hset(`game:${gameId}:state`, field, JSON.stringify({ value, filledBy }));
    }
}
// ---------------------------------------------------------------------------
// game:{gameId}:cursors helpers
// Field: userId, value: JSON { row, col }
// ---------------------------------------------------------------------------
async function getCursors(gameId) {
    const raw = (await redis.hgetall(`game:${gameId}:cursors`)) ?? {};
    const result = {};
    for (const [userId, json] of Object.entries(raw)) {
        try {
            result[userId] = JSON.parse(json);
        }
        catch {
            // skip malformed entry
        }
    }
    return result;
}
async function setCursor(gameId, userId, row, col) {
    await redis.hset(`game:${gameId}:cursors`, userId, JSON.stringify({ row, col }));
}
// ---------------------------------------------------------------------------
// game:{gameId}:participants helpers
// ---------------------------------------------------------------------------
async function addParticipant(gameId, userId) {
    await redis.sadd(`game:${gameId}:participants`, userId);
}
async function removeParticipant(gameId, userId) {
    await Promise.all([
        redis.srem(`game:${gameId}:participants`, userId),
        redis.hdel(`game:${gameId}:cursors`, userId),
    ]);
}
async function getParticipants(gameId) {
    return redis.smembers(`game:${gameId}:participants`);
}
// ---------------------------------------------------------------------------
// Cleanup: delete all keys for a game
// ---------------------------------------------------------------------------
async function deleteGameKeys(gameId) {
    await redis.del(`game:${gameId}:state`, `game:${gameId}:cursors`, `game:${gameId}:participants`);
}
//# sourceMappingURL=redis.js.map