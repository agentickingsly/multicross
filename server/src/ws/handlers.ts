import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, GameParticipant, GameCell } from "@multicross/shared";
import { logger } from "../logger";
import pool from "../db/pool";
import {
  pub,
  sub,
  getGameState,
  setCell,
  getCursors,
  setCursor,
  addParticipant,
  removeParticipant,
  deleteGameKeys,
  isMember,
  addMember,
  addSpectator,
  removeSpectator,
  getSpectatorCount,
  incrementUserConnections,
  decrementUserConnections,
} from "../db/redis";
import { setIo } from "./ioInstance";

// ---------------------------------------------------------------------------
// Zod schemas for WS payload validation
// ---------------------------------------------------------------------------

const joinRoomSchema = z.object({ gameId: z.string().uuid() });
const spectateRoomSchema = z.object({ gameId: z.string().uuid() });
const fillCellSchema = z.object({
  gameId: z.string().uuid(),
  row: z.number().int().min(0).max(99),
  col: z.number().int().min(0).max(99),
  value: z.string().regex(/^[A-Za-z]?$/),
});
const moveCursorSchema = z.object({
  gameId: z.string().uuid(),
  row: z.number().int().min(0).max(99),
  col: z.number().int().min(0).max(99),
});
const leaveRoomSchema = z.object({ gameId: z.string().uuid() });

// ---------------------------------------------------------------------------
// Whitelisted pub/sub event names (split by channel type)
// ---------------------------------------------------------------------------

const ALLOWED_GAME_EVENTS = new Set([
  "cell_updated",
  "cursor_moved",
  "participant_joined",
  "participant_left",
  "game_complete",
  "game_abandoned",
  "spectator_count",
]);

const ALLOWED_USER_EVENTS = new Set([
  "friend_request",
  "game_invite",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JwtPayload {
  userId: string;
  email: string;
}

interface SocketData {
  user: JwtPayload;
  // Cache participant info per gameId for fast cursor broadcasts
  gameParticipants: Record<string, GameParticipant>;
  // Set of gameIds this socket is watching as a spectator (not a participant)
  spectatingGames: Set<string>;
}

type CrosswordServer = Server<ClientToServerEvents, ServerToClientEvents>;
type CrosswordSocket = Socket<ClientToServerEvents, ServerToClientEvents> & {
  data: SocketData;
};

// ---------------------------------------------------------------------------
// Pub/sub state
// ---------------------------------------------------------------------------

// Track which channels this instance has subscribed to (avoid duplicate SUBSCRIBE calls)
const subscribedChannels = new Set<string>();
const subscribedUserChannels = new Set<string>();

// ---------------------------------------------------------------------------
// Row/col mapper helpers
// ---------------------------------------------------------------------------

function mapGameRow(g: any) {
  return {
    id: g.id,
    puzzleId: g.puzzle_id,
    roomCode: g.room_code,
    status: g.status,
    createdBy: g.created_by,
    startedAt: g.started_at ?? null,
    completedAt: g.completed_at ?? null,
    createdAt: g.created_at,
  };
}

function mapParticipantRow(p: any): GameParticipant {
  return {
    id: p.id,
    gameId: p.game_id,
    userId: p.user_id,
    joinedAt: p.joined_at,
    color: p.color,
  };
}

function mapCellRow(c: any): GameCell {
  return {
    id: c.id,
    gameId: c.game_id,
    row: c.row,
    col: c.col,
    value: c.value,
    filledBy: c.filled_by ?? null,
    filledAt: c.filled_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ensure this server instance is subscribed to a game's pub/sub channel
// ---------------------------------------------------------------------------

function subscribeToGameChannel(io: CrosswordServer, gameId: string) {
  const channel = `channel:game:${gameId}`;
  if (subscribedChannels.has(channel)) return;
  subscribedChannels.add(channel);
  sub.subscribe(channel, (err) => {
    if (err) logger.error({ err }, `[ws] Failed to subscribe to ${channel}`);
    else logger.info(`[ws] Subscribed to ${channel}`);
  });
}

function subscribeToUserChannel(userId: string) {
  const channel = `channel:user:${userId}`;
  if (subscribedUserChannels.has(channel)) return;
  subscribedUserChannels.add(channel);
  sub.subscribe(channel, (err) => {
    if (err) logger.error({ err }, `[ws] Failed to subscribe to ${channel}`);
  });
}

// ---------------------------------------------------------------------------
// Register handlers
// ---------------------------------------------------------------------------

export function registerWsHandlers(io: CrosswordServer): void {
  setIo(io);

  // --- JWT auth middleware ---
  (io as any).use((socket: CrosswordSocket, next: (err?: Error) => void) => {
    const token: string | undefined = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      return next(new Error("Server misconfiguration"));
    }
    try {
      const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as JwtPayload;
      socket.data = { user: payload, gameParticipants: {}, spectatingGames: new Set() };
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  // --- Pub/sub message relay ---
  sub.on("message", (channel: string, message: string) => {
    try {
      const { event, payload, sourceSocketId } = JSON.parse(message) as {
        event: string;
        payload: unknown;
        sourceSocketId: string;
      };

      if (channel.startsWith("channel:game:")) {
        if (!ALLOWED_GAME_EVENTS.has(event)) return;
        if ((io.sockets.sockets as Map<string, any>).has(sourceSocketId)) return;
        const gameId = channel.replace("channel:game:", "");
        (io.to(gameId) as any).emit(event, payload);
      } else if (channel.startsWith("channel:user:")) {
        if (!ALLOWED_USER_EVENTS.has(event)) return;
        const userId = channel.replace("channel:user:", "");
        (io.to(`user:${userId}`) as any).emit(event, payload);
      }
    } catch (err) {
      logger.error({ err }, "[ws] pub/sub relay error");
    }
  });

  // --- Connection ---
  io.on("connection", (socket) => {
    const s = socket as CrosswordSocket;
    const connUserId = s.data.user.userId;
    logger.info(`[ws] Socket connected: ${s.id} user=${connUserId}`);

    // Join personal room for direct user notifications
    s.join(`user:${connUserId}`);
    // Track connection count in Redis for online presence
    incrementUserConnections(connUserId).catch((err) =>
      logger.error({ err }, "[ws] Failed to increment user connections")
    );
    // Subscribe to personal pub/sub channel (idempotent)
    subscribeToUserChannel(connUserId);

    // -----------------------------------------------------------------------
    // join_room
    // -----------------------------------------------------------------------
    s.on("join_room", async (data) => {
      const parsed = joinRoomSchema.safeParse(data);
      if (!parsed.success) { s.emit("error" as any, { message: "Invalid payload" }); return; }
      const { gameId } = parsed.data;
      try {
        const userId = s.data.user.userId;
        // Verify game exists in postgres
        const gameResult = await pool.query(
          `SELECT id, puzzle_id, room_code, status, created_by, started_at, completed_at, created_at
           FROM games WHERE id = $1`,
          [gameId]
        );
        if (!gameResult.rows[0]) {
          s.emit("error" as any, { error: "Game not found" });
          return;
        }

        // Join Socket.io room
        await s.join(gameId);

        // Detect rejoin before updating Redis membership
        const rejoining = await isMember(gameId, userId);

        // Track participant in Redis (active presence + permanent membership)
        await Promise.all([
          addParticipant(gameId, userId),
          addMember(gameId, userId),
        ]);

        // Subscribe to pub/sub channel for this game (idempotent)
        subscribeToGameChannel(io, gameId);

        // Load current state from postgres for canonical GameCell objects + current cursors
        const [participantsResult, cellsResult, cursors] = await Promise.all([
          pool.query(
            `SELECT id, game_id, user_id, joined_at, color FROM game_participants WHERE game_id = $1`,
            [gameId]
          ),
          pool.query(
            `SELECT id, game_id, row, col, value, filled_by, filled_at FROM game_cells WHERE game_id = $1`,
            [gameId]
          ),
          getCursors(gameId),
        ]);

        const game = mapGameRow(gameResult.rows[0]);
        const participants: GameParticipant[] = participantsResult.rows.map(mapParticipantRow);
        const cells: GameCell[] = cellsResult.rows.map(mapCellRow);

        // Cache participant info on socket for fast cursor lookups
        for (const p of participants) {
          s.data.gameParticipants[gameId] = p; // default to first match; overwritten below
        }
        const myParticipant = participants.find((p) => p.userId === userId);
        if (myParticipant) s.data.gameParticipants[gameId] = myParticipant;

        // Emit room_joined only to connecting socket (includes current cursors for restoration)
        s.emit("room_joined", { game, participants, cells, cursors });

        // Broadcast participant_joined to everyone else in the room
        if (myParticipant) {
          const userResult = await pool.query(
            `SELECT display_name FROM users WHERE id = $1`,
            [userId]
          );
          const displayName: string = userResult.rows[0]?.display_name ?? `Player ${userId.slice(-4)}`;
          const participantJoinedPayload = { participant: myParticipant, displayName, rejoining };
          s.to(gameId).emit("participant_joined", participantJoinedPayload);

          // Publish for other server instances
          await pub.publish(
            `channel:game:${gameId}`,
            JSON.stringify({
              event: "participant_joined",
              payload: participantJoinedPayload,
              sourceSocketId: s.id,
            })
          );
        }
      } catch (err) {
        logger.error({ err }, "[ws] join_room error");
      }
    });

    // -----------------------------------------------------------------------
    // spectate_room
    // No participant record is created — spectators receive all broadcasts
    // but cannot mutate game state. Tracked in Redis game:{gameId}:spectators
    // by socket ID (not userId) because the same user could spectate from
    // multiple tabs.
    // NOTE: integration-level — no unit tests cover this handler.
    // -----------------------------------------------------------------------
    s.on("spectate_room", async (data) => {
      const parsed = spectateRoomSchema.safeParse(data);
      if (!parsed.success) { s.emit("error" as any, { message: "Invalid payload" }); return; }
      const { gameId } = parsed.data;
      try {
        const userId = s.data.user.userId;

        // Reject if the user is already a participant — they should use join_room
        const participantCheck = await pool.query(
          "SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2",
          [gameId, userId]
        );
        if (participantCheck.rows[0]) {
          s.emit("error" as any, { error: "Already a participant — use join_room" });
          return;
        }

        const gameResult = await pool.query(
          `SELECT id, puzzle_id, room_code, status, created_by, started_at, completed_at, created_at
           FROM games WHERE id = $1`,
          [gameId]
        );
        if (!gameResult.rows[0]) {
          s.emit("error" as any, { error: "Game not found" });
          return;
        }

        await s.join(gameId);
        await addSpectator(gameId, s.id);
        s.data.spectatingGames.add(gameId);

        subscribeToGameChannel(io, gameId);

        const [participantsResult, cellsResult, cursors] = await Promise.all([
          pool.query(
            `SELECT id, game_id, user_id, joined_at, color FROM game_participants WHERE game_id = $1`,
            [gameId]
          ),
          pool.query(
            `SELECT id, game_id, row, col, value, filled_by, filled_at FROM game_cells WHERE game_id = $1`,
            [gameId]
          ),
          getCursors(gameId),
        ]);

        const game = mapGameRow(gameResult.rows[0]);
        const participants: GameParticipant[] = participantsResult.rows.map(mapParticipantRow);
        const cells: GameCell[] = cellsResult.rows.map(mapCellRow);

        s.emit("room_joined", { game, participants, cells, cursors });

        // Broadcast updated spectator count to everyone in the room (including new spectator)
        const count = await getSpectatorCount(gameId);
        const spectatorCountPayload = { gameId, count };
        io.to(gameId).emit("spectator_count", spectatorCountPayload);
        await pub.publish(
          `channel:game:${gameId}`,
          JSON.stringify({ event: "spectator_count", payload: spectatorCountPayload, sourceSocketId: s.id })
        );
      } catch (err) {
        logger.error({ err }, "[ws] spectate_room error");
      }
    });

    // -----------------------------------------------------------------------
    // fill_cell
    // -----------------------------------------------------------------------
    s.on("fill_cell", async (data) => {
      const parsed = fillCellSchema.safeParse(data);
      if (!parsed.success) { s.emit("error" as any, { message: "Invalid payload" }); return; }
      const { gameId, row, col, value } = parsed.data;
      // Silently ignore spectators — they have no participant record anyway
      if (s.data.spectatingGames?.has(gameId)) return;
      try {
        const userId = s.data.user.userId;
        const memberCheck = await pool.query(
          "SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2",
          [gameId, userId]
        );
        if (!memberCheck.rows[0]) {
          s.emit("error" as any, { error: "Not a participant" });
          return;
        }
        // Validate: single A-Z letter or empty string
        if (value !== "" && !/^[A-Za-z]$/.test(value)) {
          s.emit("error" as any, { error: "Invalid cell value" });
          return;
        }
        const normalised = value.toUpperCase();

        // Write to Redis
        await setCell(gameId, row, col, normalised, userId);

        // Look up the expected answer from the puzzle grid
        const puzzleResult = await pool.query(
          `SELECT p.grid FROM games g JOIN puzzles p ON g.puzzle_id = p.id WHERE g.id = $1`,
          [gameId]
        );
        const grid: (string | null)[][] | null = puzzleResult.rows[0]?.grid ?? null;
        const expected = grid ? (grid[row]?.[col] ?? null) : null;
        const correct = normalised !== "" && expected !== null && normalised === expected;

        // Persist to postgres (upsert), record move history, and update activity timestamp
        await Promise.all([
          normalised !== ""
            ? pool.query(
                `INSERT INTO game_cells (game_id, row, col, value, filled_by, filled_at)
                 VALUES ($1, $2, $3, $4, $5, now())
                 ON CONFLICT (game_id, row, col)
                 DO UPDATE SET value = EXCLUDED.value, filled_by = EXCLUDED.filled_by, filled_at = EXCLUDED.filled_at`,
                [gameId, row, col, normalised, userId]
              )
            : pool.query(
                `DELETE FROM game_cells WHERE game_id = $1 AND row = $2 AND col = $3`,
                [gameId, row, col]
              ),
          pool.query(
            `INSERT INTO game_moves (game_id, user_id, row, col, value) VALUES ($1, $2, $3, $4, $5)`,
            [gameId, userId, row, col, normalised]
          ),
          pool.query(
            `UPDATE games SET last_activity_at = now() WHERE id = $1`,
            [gameId]
          ),
        ]);

        // Broadcast cell_updated to ALL sockets in room (including sender)
        const cellUpdatedPayload = { row, col, value: normalised, filledBy: userId, correct };
        io.to(gameId).emit("cell_updated", cellUpdatedPayload);

        // Publish for other server instances
        await pub.publish(
          `channel:game:${gameId}`,
          JSON.stringify({
            event: "cell_updated",
            payload: cellUpdatedPayload,
            sourceSocketId: s.id,
          })
        );

        // Check game_complete only when a letter was placed
        if (normalised !== "" && grid) {
          await checkGameComplete(io, gameId, grid);
        }
      } catch (err) {
        logger.error({ err }, "[ws] fill_cell error");
      }
    });

    // -----------------------------------------------------------------------
    // move_cursor
    // -----------------------------------------------------------------------
    s.on("move_cursor", async (data) => {
      const parsed = moveCursorSchema.safeParse(data);
      if (!parsed.success) { s.emit("error" as any, { message: "Invalid payload" }); return; }
      const { gameId, row, col } = parsed.data;
      // Silently ignore spectators
      if (s.data.spectatingGames?.has(gameId)) return;
      try {
        const userId = s.data.user.userId;
        const memberCheck = await pool.query(
          "SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2",
          [gameId, userId]
        );
        if (!memberCheck.rows[0]) {
          s.emit("error" as any, { error: "Not a participant" });
          return;
        }
        await setCursor(gameId, userId, row, col);

        const participant = s.data.gameParticipants[gameId];
        const color = participant?.userId === userId ? participant.color : "#888888";

        const cursorMovedPayload = { userId, row, col, color };

        // Broadcast to everyone EXCEPT sender
        s.to(gameId).emit("cursor_moved", cursorMovedPayload);

        // Publish for other server instances (they will broadcast to all their local sockets,
        // none of which is the sender)
        await pub.publish(
          `channel:game:${gameId}`,
          JSON.stringify({
            event: "cursor_moved",
            payload: cursorMovedPayload,
            sourceSocketId: s.id,
          })
        );
      } catch (err) {
        logger.error({ err }, "[ws] move_cursor error");
      }
    });

    // -----------------------------------------------------------------------
    // leave_room
    // -----------------------------------------------------------------------
    s.on("leave_room", async (data) => {
      const parsed = leaveRoomSchema.safeParse(data);
      if (!parsed.success) { s.emit("error" as any, { message: "Invalid payload" }); return; }
      const { gameId } = parsed.data;
      try {
        const userId = s.data.user.userId;
        const memberCheck = await pool.query(
          "SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2",
          [gameId, userId]
        );
        if (!memberCheck.rows[0]) {
          s.emit("error" as any, { error: "Not a participant" });
          return;
        }
        await s.leave(gameId);
        await removeParticipant(gameId, userId); // Redis-only: cursors + participant set

        const participantLeftPayload = { userId };
        io.to(gameId).emit("participant_left", participantLeftPayload);

        await pub.publish(
          `channel:game:${gameId}`,
          JSON.stringify({
            event: "participant_left",
            payload: participantLeftPayload,
            sourceSocketId: s.id,
          })
        );
      } catch (err) {
        logger.error({ err }, "[ws] leave_room error");
      }
    });

    // -----------------------------------------------------------------------
    // disconnecting — fires before socket leaves its rooms (s.rooms still populated)
    // disconnect  — fires after; s.rooms is empty by then (Socket.io v4 behaviour)
    //
    // Spectator cleanup runs here using s.data.spectatingGames directly — we own
    // that Set so we don't need s.rooms at all.  Participant cleanup also runs here
    // so that s.rooms is still accessible for the fallback path (unexpected drops
    // where the client never emitted leave_room).
    // -----------------------------------------------------------------------
    s.on("disconnecting", async () => {
      logger.info(`[ws] Socket disconnecting: ${s.id}`);
      const userId = s.data?.user?.userId;
      if (!userId) return;

      // Decrement connection counter; key deleted when it reaches 0
      decrementUserConnections(userId).catch((err) =>
        logger.error({ err }, "[ws] Failed to decrement user connections")
      );

      // Spectator cleanup — iterate our own Set, not s.rooms, for reliability.
      for (const gameId of (s.data.spectatingGames ?? [])) {
        try {
          await removeSpectator(gameId, s.id);
          const count = await getSpectatorCount(gameId);
          const spectatorCountPayload = { gameId, count };
          io.to(gameId).emit("spectator_count", spectatorCountPayload);
          await pub.publish(
            `channel:game:${gameId}`,
            JSON.stringify({ event: "spectator_count", payload: spectatorCountPayload, sourceSocketId: s.id })
          );
        } catch (err) {
          logger.error({ err }, `[ws] spectator disconnecting cleanup error for game ${gameId}`);
        }
      }

      // Participant cleanup (fallback for unexpected drops — normal flow uses leave_room).
      // s.rooms is still populated here because we're on "disconnecting", not "disconnect".
      for (const gameId of s.rooms) {
        if (gameId === s.id) continue; // skip socket's own default room
        if (s.data.spectatingGames?.has(gameId)) continue; // already handled above
        try {
          await removeParticipant(gameId, userId);
          const participantLeftPayload = { userId };
          io.to(gameId).emit("participant_left", participantLeftPayload);
          await pub.publish(
            `channel:game:${gameId}`,
            JSON.stringify({
              event: "participant_left",
              payload: participantLeftPayload,
              sourceSocketId: s.id,
            })
          );
        } catch (err) {
          logger.error({ err }, `[ws] participant disconnecting cleanup error for game ${gameId}`);
        }
      }
    });

    s.on("disconnect", () => {
      logger.info(`[ws] Socket disconnected: ${s.id}`);
    });
  });
}

// ---------------------------------------------------------------------------
// Game complete check
// ---------------------------------------------------------------------------

async function checkGameComplete(
  io: CrosswordServer,
  gameId: string,
  grid: (string | null)[][]
): Promise<void> {
  const stateHash = await getGameState(gameId);

  // Build a map of correct answers from the grid
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      const expected = grid[r][c];
      if (expected === null) continue; // black cell, skip

      const entry = stateHash[`${r}:${c}`];
      if (!entry) return; // cell not yet filled

      let parsed: { value: string; filledBy: string };
      try {
        parsed = JSON.parse(entry);
      } catch {
        return;
      }
      if (parsed.value !== expected.toUpperCase()) return; // wrong answer
    }
  }

  // All cells correctly filled — update postgres and emit game_complete
  const now = new Date().toISOString();

  const result = await pool.query(
    `UPDATE games SET status = 'complete', completed_at = now() WHERE id = $1 AND status != 'complete'`,
    [gameId]
  );
  if (result.rowCount === 0) return;

  await pool.query(
    `UPDATE puzzles SET play_count = play_count + 1
     WHERE id = (SELECT puzzle_id FROM games WHERE id = $1)`,
    [gameId]
  );

  // Compute per-user stats from Redis state
  const statsMap: Record<string, number> = {};
  for (const json of Object.values(stateHash)) {
    try {
      const { filledBy } = JSON.parse(json) as { value: string; filledBy: string };
      statsMap[filledBy] = (statsMap[filledBy] ?? 0) + 1;
    } catch {
      // skip
    }
  }
  const stats = Object.entries(statsMap).map(([userId, cellsFilled]) => ({
    userId,
    cellsFilled,
  }));

  const gameCompletePayload = { completedAt: now, stats };
  io.to(gameId).emit("game_complete", gameCompletePayload);

  await pub.publish(
    `channel:game:${gameId}`,
    JSON.stringify({
      event: "game_complete",
      payload: gameCompletePayload,
      sourceSocketId: "__server__",
    })
  );

  // Clean up Redis keys
  await deleteGameKeys(gameId);
}
