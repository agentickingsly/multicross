import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// General-purpose client for reads/writes
const redis = new Redis(REDIS_URL);

// Separate pub/sub clients — ioredis requires dedicated instances for subscribe mode
export const pub = new Redis(REDIS_URL);
export const sub = new Redis(REDIS_URL);

export default redis;

// ---------------------------------------------------------------------------
// game:{gameId}:state helpers
// Field format: "{row}:{col}", value: JSON { value, filledBy }
// ---------------------------------------------------------------------------

export interface CellState {
  value: string;
  filledBy: string;
}

/** Returns raw hash of all filled cells. Keys are "{row}:{col}", values are JSON strings. */
export async function getGameState(gameId: string): Promise<Record<string, string>> {
  return (await redis.hgetall(`game:${gameId}:state`)) ?? {};
}

/** Upserts or deletes a cell in the game state hash. */
export async function setCell(
  gameId: string,
  row: number,
  col: number,
  value: string,
  filledBy: string
): Promise<void> {
  const field = `${row}:${col}`;
  if (value === "") {
    await redis.hdel(`game:${gameId}:state`, field);
  } else {
    await redis.hset(
      `game:${gameId}:state`,
      field,
      JSON.stringify({ value, filledBy })
    );
  }
}

// ---------------------------------------------------------------------------
// game:{gameId}:cursors helpers
// Field: userId, value: JSON { row, col }
// ---------------------------------------------------------------------------

export async function getCursors(
  gameId: string
): Promise<Record<string, { row: number; col: number }>> {
  const raw = (await redis.hgetall(`game:${gameId}:cursors`)) ?? {};
  const result: Record<string, { row: number; col: number }> = {};
  for (const [userId, json] of Object.entries(raw)) {
    try {
      result[userId] = JSON.parse(json);
    } catch {
      // skip malformed entry
    }
  }
  return result;
}

export async function setCursor(
  gameId: string,
  userId: string,
  row: number,
  col: number
): Promise<void> {
  await redis.hset(
    `game:${gameId}:cursors`,
    userId,
    JSON.stringify({ row, col })
  );
}

// ---------------------------------------------------------------------------
// game:{gameId}:participants helpers
// ---------------------------------------------------------------------------

export async function addParticipant(gameId: string, userId: string): Promise<void> {
  await redis.sadd(`game:${gameId}:participants`, userId);
}

export async function removeParticipant(gameId: string, userId: string): Promise<void> {
  await Promise.all([
    redis.srem(`game:${gameId}:participants`, userId),
    redis.hdel(`game:${gameId}:cursors`, userId),
  ]);
}

export async function getParticipants(gameId: string): Promise<string[]> {
  return redis.smembers(`game:${gameId}:participants`);
}

// ---------------------------------------------------------------------------
// Cleanup: delete all keys for a game
// ---------------------------------------------------------------------------
export async function deleteGameKeys(gameId: string): Promise<void> {
  await redis.del(
    `game:${gameId}:state`,
    `game:${gameId}:cursors`,
    `game:${gameId}:participants`
  );
}
