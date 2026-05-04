import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents, ServerToClientEvents, GameParticipant, GameCell,
  MatchCompletedPayload,
} from "@multicross/shared";
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

const matchAcceptSchema  = z.object({ matchId: z.string().uuid() });
const matchDeclineSchema = z.object({ matchId: z.string().uuid() });
const matchFillCellSchema = z.object({
  matchId: z.string().uuid(),
  row:     z.number().int().min(0).max(99),
  col:     z.number().int().min(0).max(99),
  value:   z.string().regex(/^[A-Za-z]?$/),
});

// TODO: timer references are lost on server restart — timed_out matches will
// remain in 'active' status until a future restart-recovery job is added.
const matchTimers = new Map<string, NodeJS.Timeout>();

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
  "word_complete",
]);

const ALLOWED_USER_EVENTS = new Set([
  "friend_request",
  "game_invite",
  "match_invite",
  "match_started",
  "match_cell_updated",
  "match_completed",
  "match_cancelled",
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

        // Check word/game completion only when a letter was placed
        if (normalised !== "" && grid) {
          await checkWordComplete(io, gameId, row, col, grid);
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
    // match_accept
    // -----------------------------------------------------------------------
    s.on("match_accept", async (data) => {
      const parsed = matchAcceptSchema.safeParse(data);
      if (!parsed.success) { s.emit("error" as any, { message: "Invalid payload" }); return; }
      const { matchId } = parsed.data;
      try {
        const userId = s.data.user.userId;

        const matchResult = await pool.query(
          `SELECT m.id, m.challenger_id, m.opponent_id, m.puzzle_id, m.time_limit_seconds,
                  p.title AS puzzle_title,
                  uc.display_name AS challenger_name
           FROM competitive_matches m
           JOIN puzzles p ON p.id = m.puzzle_id
           JOIN users uc  ON uc.id = m.challenger_id
           WHERE m.id = $1`,
          [matchId]
        );
        const match = matchResult.rows[0];
        if (!match) { s.emit("error" as any, { error: "Match not found" }); return; }
        if (match.opponent_id !== userId) { s.emit("error" as any, { error: "Not the opponent" }); return; }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const updated = await client.query(
            `UPDATE competitive_matches SET status = 'active', started_at = now()
             WHERE id = $1 AND status = 'pending'
             RETURNING started_at`,
            [matchId]
          );
          if (!updated.rows[0]) {
            await client.query("ROLLBACK");
            s.emit("error" as any, { error: "Match no longer pending" });
            return;
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        const puzzleResult = await pool.query(
          `SELECT id, title, author, author_id, width, height, grid, clues, status, created_at, updated_at
           FROM puzzles WHERE id = $1`,
          [match.puzzle_id]
        );
        const pr = puzzleResult.rows[0];
        const puzzle = {
          id: pr.id as string,
          title: pr.title as string,
          author: pr.author as string,
          width: pr.width as number,
          height: pr.height as number,
          grid: pr.grid as (string | null)[][],
          clues: pr.clues as { across: Record<number, string>; down: Record<number, string> },
          createdAt: pr.created_at as string,
        };

        const startedAtResult = await pool.query(
          `SELECT started_at FROM competitive_matches WHERE id = $1`,
          [matchId]
        );
        const startsAt: string = (startedAtResult.rows[0]?.started_at as Date).toISOString();
        const timeLimitSeconds: number = match.time_limit_seconds as number;

        const challengerId: string = match.challenger_id;
        const opponentId: string = match.opponent_id;

        // Send match_started to both players via their personal rooms
        const challengerPayload = {
          matchId,
          puzzle,
          opponentId,
          timeLimitSeconds,
          startsAt,
        };
        const opponentPayload = {
          matchId,
          puzzle,
          opponentId: challengerId,
          timeLimitSeconds,
          startsAt,
        };

        io.to(`user:${challengerId}`).emit("match_started", challengerPayload);
        io.to(`user:${opponentId}`).emit("match_started", opponentPayload);

        await Promise.all([
          pub.publish(
            `channel:user:${challengerId}`,
            JSON.stringify({ event: "match_started", payload: challengerPayload, sourceSocketId: s.id })
          ),
          pub.publish(
            `channel:user:${opponentId}`,
            JSON.stringify({ event: "match_started", payload: opponentPayload, sourceSocketId: s.id })
          ),
        ]);

        startMatchTimer(io, matchId, challengerId, opponentId, timeLimitSeconds);
        logger.info({ matchId, challengerId, opponentId }, "[ws] match_accept: match started");
      } catch (err) {
        logger.error({ err }, "[ws] match_accept error");
      }
    });

    // -----------------------------------------------------------------------
    // match_decline
    // -----------------------------------------------------------------------
    s.on("match_decline", async (data) => {
      const parsed = matchDeclineSchema.safeParse(data);
      if (!parsed.success) { s.emit("error" as any, { message: "Invalid payload" }); return; }
      const { matchId } = parsed.data;
      try {
        const userId = s.data.user.userId;

        const updated = await pool.query(
          `UPDATE competitive_matches SET status = 'cancelled'
           WHERE id = $1 AND opponent_id = $2 AND status = 'pending'
           RETURNING challenger_id`,
          [matchId, userId]
        );
        if (!updated.rows[0]) {
          s.emit("error" as any, { error: "Match not found or not pending" });
          return;
        }
        const challengerId: string = updated.rows[0].challenger_id;

        const cancelPayload = { matchId };
        io.to(`user:${challengerId}`).emit("match_cancelled", cancelPayload);
        await pub.publish(
          `channel:user:${challengerId}`,
          JSON.stringify({ event: "match_cancelled", payload: cancelPayload, sourceSocketId: s.id })
        );
        logger.info({ matchId }, "[ws] match_decline: match cancelled");
      } catch (err) {
        logger.error({ err }, "[ws] match_decline error");
      }
    });

    // -----------------------------------------------------------------------
    // match_fill_cell
    // -----------------------------------------------------------------------
    s.on("match_fill_cell", async (data) => {
      const parsed = matchFillCellSchema.safeParse(data);
      if (!parsed.success) { s.emit("error" as any, { message: "Invalid payload" }); return; }
      const { matchId, row, col, value } = parsed.data;
      try {
        const userId = s.data.user.userId;
        const normalised = value.toUpperCase();

        // Validate match is active and user is a participant
        const matchResult = await pool.query(
          `SELECT m.challenger_id, m.opponent_id, m.status, p.grid
           FROM competitive_matches m
           JOIN puzzles p ON p.id = m.puzzle_id
           WHERE m.id = $1`,
          [matchId]
        );
        const match = matchResult.rows[0];
        if (!match) { s.emit("error" as any, { error: "Match not found" }); return; }
        if (match.status !== "active") { s.emit("error" as any, { error: "Match is not active" }); return; }

        const challengerId: string = match.challenger_id;
        const opponentId: string = match.opponent_id;
        if (userId !== challengerId && userId !== opponentId) {
          s.emit("error" as any, { error: "Not a participant" });
          return;
        }

        const grid: (string | null)[][] = match.grid;
        const cellExpected = grid[row]?.[col];
        if (cellExpected === null || cellExpected === undefined) {
          s.emit("error" as any, { error: "Invalid cell position" });
          return;
        }

        // Upsert or delete the cell
        if (normalised !== "") {
          await pool.query(
            `INSERT INTO competitive_cells (match_id, user_id, row, col, value, filled_at)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT (match_id, user_id, row, col)
             DO UPDATE SET value = EXCLUDED.value, filled_at = now()`,
            [matchId, userId, row, col, normalised]
          );
        } else {
          await pool.query(
            `DELETE FROM competitive_cells WHERE match_id = $1 AND user_id = $2 AND row = $3 AND col = $4`,
            [matchId, userId, row, col]
          );
        }

        // Emit match_cell_updated to both players — no letter value
        const cellUpdatedPayload = {
          matchId,
          userId,
          row,
          col,
          filled: normalised !== "",
        };
        const otherUserId = userId === challengerId ? opponentId : challengerId;
        io.to(`user:${userId}`).emit("match_cell_updated", cellUpdatedPayload);
        io.to(`user:${otherUserId}`).emit("match_cell_updated", cellUpdatedPayload);
        await Promise.all([
          pub.publish(
            `channel:user:${userId}`,
            JSON.stringify({ event: "match_cell_updated", payload: cellUpdatedPayload, sourceSocketId: s.id })
          ),
          pub.publish(
            `channel:user:${otherUserId}`,
            JSON.stringify({ event: "match_cell_updated", payload: cellUpdatedPayload, sourceSocketId: s.id })
          ),
        ]);

        // Check if the user has completed the puzzle (all non-black cells correct)
        if (normalised !== "") {
          const filledResult = await pool.query(
            `SELECT row, col, value FROM competitive_cells WHERE match_id = $1 AND user_id = $2`,
            [matchId, userId]
          );
          const filledMap = new Map<string, string>();
          for (const fc of filledResult.rows) {
            filledMap.set(`${fc.row as number}:${fc.col as number}`, (fc.value as string).toUpperCase());
          }

          let allCorrect = true;
          for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
              const expected = grid[r][c];
              if (expected === null) continue;
              if (filledMap.get(`${r}:${c}`) !== expected.toUpperCase()) {
                allCorrect = false;
                break;
              }
            }
            if (!allCorrect) break;
          }

          if (allCorrect) {
            await resolveMatch(io, matchId, userId, challengerId, opponentId, "completed");
          }
        }
      } catch (err) {
        logger.error({ err }, "[ws] match_fill_cell error");
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
// Competitive mode helpers
// ---------------------------------------------------------------------------

async function resolveMatch(
  io: CrosswordServer,
  matchId: string,
  winnerId: string | null,
  challengerId: string,
  opponentId: string,
  reason: "completed" | "timeout"
): Promise<void> {
  // Idempotent: only resolve once
  const updated = await pool.query(
    `UPDATE competitive_matches
     SET status = $1, completed_at = now(), winner_id = $2
     WHERE id = $3 AND status = 'active'
     RETURNING id`,
    [reason === "completed" ? "completed" : "timed_out", winnerId, matchId]
  );
  if (!updated.rows[0]) return; // already resolved

  // Clear the timeout if present
  const timer = matchTimers.get(matchId);
  if (timer) {
    clearTimeout(timer);
    matchTimers.delete(matchId);
  }

  const [challengerCountResult, opponentCountResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS cnt FROM competitive_cells WHERE match_id = $1 AND user_id = $2`,
      [matchId, challengerId]
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM competitive_cells WHERE match_id = $1 AND user_id = $2`,
      [matchId, opponentId]
    ),
  ]);
  const challengerCells = parseInt(challengerCountResult.rows[0]?.cnt ?? "0", 10);
  const opponentCells   = parseInt(opponentCountResult.rows[0]?.cnt   ?? "0", 10);

  const payload: MatchCompletedPayload = {
    matchId,
    winnerId,
    reason,
    challengerCells,
    opponentCells,
  };

  io.to(`user:${challengerId}`).emit("match_completed", payload);
  io.to(`user:${opponentId}`).emit("match_completed", payload);
  await Promise.all([
    pub.publish(
      `channel:user:${challengerId}`,
      JSON.stringify({ event: "match_completed", payload, sourceSocketId: "__server__" })
    ),
    pub.publish(
      `channel:user:${opponentId}`,
      JSON.stringify({ event: "match_completed", payload, sourceSocketId: "__server__" })
    ),
  ]);

  logger.info({ matchId, winnerId, reason, challengerCells, opponentCells }, "[ws] match resolved");
}

function startMatchTimer(
  io: CrosswordServer,
  matchId: string,
  challengerId: string,
  opponentId: string,
  timeLimitSeconds: number
): void {
  const timer = setTimeout(async () => {
    matchTimers.delete(matchId);
    try {
      const [challengerCountResult, opponentCountResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS cnt FROM competitive_cells WHERE match_id = $1 AND user_id = $2`,
          [matchId, challengerId]
        ),
        pool.query(
          `SELECT COUNT(*) AS cnt FROM competitive_cells WHERE match_id = $1 AND user_id = $2`,
          [matchId, opponentId]
        ),
      ]);
      const challengerCells = parseInt(challengerCountResult.rows[0]?.cnt ?? "0", 10);
      const opponentCells   = parseInt(opponentCountResult.rows[0]?.cnt   ?? "0", 10);

      let winnerId: string | null = null;
      if (challengerCells > opponentCells) {
        winnerId = challengerId;
      } else if (opponentCells > challengerCells) {
        winnerId = opponentId;
      }
      // Equal counts → null (draw)

      await resolveMatch(io, matchId, winnerId, challengerId, opponentId, "timeout");
    } catch (err) {
      logger.error({ err }, "[ws] match timer expiry error");
    }
  }, timeLimitSeconds * 1000);

  matchTimers.set(matchId, timer);
}

// ---------------------------------------------------------------------------
// Word complete check
// ---------------------------------------------------------------------------

async function checkWordComplete(
  io: CrosswordServer,
  gameId: string,
  row: number,
  col: number,
  grid: (string | null)[][]
): Promise<void> {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (grid[row]?.[col] === null) return;

  const stateHash = await getGameState(gameId);

  function getCellValue(r: number, c: number): string | null {
    const entry = stateHash[`${r}:${c}`];
    if (!entry) return null;
    try {
      return (JSON.parse(entry) as { value: string }).value;
    } catch {
      return null;
    }
  }

  function isWordComplete(wordCells: Array<[number, number]>): boolean {
    return wordCells.every(([r, c]) => {
      const expected = grid[r]?.[c];
      if (!expected) return false;
      const actual = getCellValue(r, c);
      return actual === expected.toUpperCase();
    });
  }

  const completedWordCells: Array<Array<{ row: number; col: number }>> = [];

  // Across word containing (row, col)
  let startCol = col;
  while (startCol > 0 && grid[row]?.[startCol - 1] !== null) startCol--;
  const acrossCells: Array<[number, number]> = [];
  for (let c = startCol; c < width && grid[row]?.[c] !== null; c++) {
    acrossCells.push([row, c]);
  }
  if (acrossCells.length >= 2 && isWordComplete(acrossCells)) {
    completedWordCells.push(acrossCells.map(([r, c]) => ({ row: r, col: c })));
  }

  // Down word containing (row, col)
  let startRow = row;
  while (startRow > 0 && grid[startRow - 1]?.[col] !== null) startRow--;
  const downCells: Array<[number, number]> = [];
  for (let r = startRow; r < height && grid[r]?.[col] !== null; r++) {
    downCells.push([r, col]);
  }
  if (downCells.length >= 2 && isWordComplete(downCells)) {
    completedWordCells.push(downCells.map(([r, c]) => ({ row: r, col: c })));
  }

  for (const cells of completedWordCells) {
    const payload = { cells };
    io.to(gameId).emit("word_complete", payload);
    await pub.publish(
      `channel:game:${gameId}`,
      JSON.stringify({ event: "word_complete", payload, sourceSocketId: "__server__" })
    );
  }
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
