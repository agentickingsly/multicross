"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWsHandlers = registerWsHandlers;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const logger_1 = require("../logger");
const pool_1 = __importDefault(require("../db/pool"));
const redis_1 = require("../db/redis");
// ---------------------------------------------------------------------------
// Zod schemas for WS payload validation
// ---------------------------------------------------------------------------
const joinRoomSchema = zod_1.z.object({ gameId: zod_1.z.string().uuid() });
const fillCellSchema = zod_1.z.object({
    gameId: zod_1.z.string().uuid(),
    row: zod_1.z.number().int().min(0).max(99),
    col: zod_1.z.number().int().min(0).max(99),
    value: zod_1.z.string().regex(/^[A-Za-z]?$/),
});
const moveCursorSchema = zod_1.z.object({
    gameId: zod_1.z.string().uuid(),
    row: zod_1.z.number().int().min(0).max(99),
    col: zod_1.z.number().int().min(0).max(99),
});
const leaveRoomSchema = zod_1.z.object({ gameId: zod_1.z.string().uuid() });
// ---------------------------------------------------------------------------
// Whitelisted pub/sub event names
// ---------------------------------------------------------------------------
const ALLOWED_EVENTS = new Set([
    "cell_updated",
    "cursor_moved",
    "participant_joined",
    "participant_left",
    "game_complete",
]);
// ---------------------------------------------------------------------------
// Pub/sub state
// ---------------------------------------------------------------------------
// Track which game channels this instance has subscribed to (avoid duplicate SUBSCRIBE calls)
const subscribedChannels = new Set();
// ---------------------------------------------------------------------------
// Row/col mapper helpers
// ---------------------------------------------------------------------------
function mapGameRow(g) {
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
function mapParticipantRow(p) {
    return {
        id: p.id,
        gameId: p.game_id,
        userId: p.user_id,
        joinedAt: p.joined_at,
        color: p.color,
    };
}
function mapCellRow(c) {
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
function subscribeToGameChannel(io, gameId) {
    const channel = `channel:game:${gameId}`;
    if (subscribedChannels.has(channel))
        return;
    subscribedChannels.add(channel);
    redis_1.sub.subscribe(channel, (err) => {
        if (err)
            logger_1.logger.error({ err }, `[ws] Failed to subscribe to ${channel}`);
        else
            logger_1.logger.info(`[ws] Subscribed to ${channel}`);
    });
}
// ---------------------------------------------------------------------------
// Register handlers
// ---------------------------------------------------------------------------
function registerWsHandlers(io) {
    // --- JWT auth middleware ---
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error("Authentication required"));
        }
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
            return next(new Error("Server misconfiguration"));
        }
        try {
            const payload = jsonwebtoken_1.default.verify(token, secret, { algorithms: ["HS256"] });
            socket.data = { user: payload, gameParticipants: {} };
            next();
        }
        catch {
            next(new Error("Invalid or expired token"));
        }
    });
    // --- Pub/sub message relay ---
    // When another server instance publishes a game event, broadcast it to our local sockets.
    redis_1.sub.on("message", (channel, message) => {
        try {
            const { event, payload, sourceSocketId } = JSON.parse(message);
            if (!ALLOWED_EVENTS.has(event))
                return;
            // Skip if the source socket is on this instance (already broadcast locally)
            if (io.sockets.sockets.has(sourceSocketId))
                return;
            const gameId = channel.replace("channel:game:", "");
            io.to(gameId).emit(event, payload);
        }
        catch (err) {
            logger_1.logger.error({ err }, "[ws] pub/sub relay error");
        }
    });
    // --- Connection ---
    io.on("connection", (socket) => {
        const s = socket;
        logger_1.logger.info(`[ws] Socket connected: ${s.id} user=${s.data.user.userId}`);
        // -----------------------------------------------------------------------
        // join_room
        // -----------------------------------------------------------------------
        s.on("join_room", async (data) => {
            const parsed = joinRoomSchema.safeParse(data);
            if (!parsed.success) {
                s.emit("error", { message: "Invalid payload" });
                return;
            }
            const { gameId } = parsed.data;
            try {
                const userId = s.data.user.userId;
                // Verify game exists in postgres
                const gameResult = await pool_1.default.query(`SELECT id, puzzle_id, room_code, status, created_by, started_at, completed_at, created_at
           FROM games WHERE id = $1`, [gameId]);
                if (!gameResult.rows[0]) {
                    s.emit("error", { error: "Game not found" });
                    return;
                }
                // Join Socket.io room
                await s.join(gameId);
                // Track participant in Redis
                await (0, redis_1.addParticipant)(gameId, userId);
                // Subscribe to pub/sub channel for this game (idempotent)
                subscribeToGameChannel(io, gameId);
                // Load current state from postgres for canonical GameCell objects
                const [participantsResult, cellsResult] = await Promise.all([
                    pool_1.default.query(`SELECT id, game_id, user_id, joined_at, color FROM game_participants WHERE game_id = $1`, [gameId]),
                    pool_1.default.query(`SELECT id, game_id, row, col, value, filled_by, filled_at FROM game_cells WHERE game_id = $1`, [gameId]),
                ]);
                const game = mapGameRow(gameResult.rows[0]);
                const participants = participantsResult.rows.map(mapParticipantRow);
                const cells = cellsResult.rows.map(mapCellRow);
                // Cache participant info on socket for fast cursor lookups
                for (const p of participants) {
                    s.data.gameParticipants[gameId] = p; // default to first match; overwritten below
                }
                const myParticipant = participants.find((p) => p.userId === userId);
                if (myParticipant)
                    s.data.gameParticipants[gameId] = myParticipant;
                // Emit room_joined only to connecting socket
                s.emit("room_joined", { game, participants, cells });
                // Broadcast participant_joined to everyone else in the room
                if (myParticipant) {
                    const userResult = await pool_1.default.query(`SELECT display_name FROM users WHERE id = $1`, [userId]);
                    const displayName = userResult.rows[0]?.display_name ?? `Player ${userId.slice(-4)}`;
                    const participantJoinedPayload = { participant: myParticipant, displayName };
                    s.to(gameId).emit("participant_joined", participantJoinedPayload);
                    // Publish for other server instances
                    await redis_1.pub.publish(`channel:game:${gameId}`, JSON.stringify({
                        event: "participant_joined",
                        payload: participantJoinedPayload,
                        sourceSocketId: s.id,
                    }));
                }
            }
            catch (err) {
                logger_1.logger.error({ err }, "[ws] join_room error");
            }
        });
        // -----------------------------------------------------------------------
        // fill_cell
        // -----------------------------------------------------------------------
        s.on("fill_cell", async (data) => {
            const parsed = fillCellSchema.safeParse(data);
            if (!parsed.success) {
                s.emit("error", { message: "Invalid payload" });
                return;
            }
            const { gameId, row, col, value } = parsed.data;
            try {
                const userId = s.data.user.userId;
                const memberCheck = await pool_1.default.query("SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2", [gameId, userId]);
                if (!memberCheck.rows[0]) {
                    s.emit("error", { error: "Not a participant" });
                    return;
                }
                // Validate: single A-Z letter or empty string
                if (value !== "" && !/^[A-Za-z]$/.test(value)) {
                    s.emit("error", { error: "Invalid cell value" });
                    return;
                }
                const normalised = value.toUpperCase();
                // Write to Redis
                await (0, redis_1.setCell)(gameId, row, col, normalised, userId);
                // Look up the expected answer from the puzzle grid
                const puzzleResult = await pool_1.default.query(`SELECT p.grid FROM games g JOIN puzzles p ON g.puzzle_id = p.id WHERE g.id = $1`, [gameId]);
                const grid = puzzleResult.rows[0]?.grid ?? null;
                const expected = grid ? (grid[row]?.[col] ?? null) : null;
                const correct = normalised !== "" && expected !== null && normalised === expected;
                // Persist to postgres (upsert)
                if (normalised !== "") {
                    await pool_1.default.query(`INSERT INTO game_cells (game_id, row, col, value, filled_by, filled_at)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT (game_id, row, col)
             DO UPDATE SET value = EXCLUDED.value, filled_by = EXCLUDED.filled_by, filled_at = EXCLUDED.filled_at`, [gameId, row, col, normalised, userId]);
                }
                else {
                    await pool_1.default.query(`DELETE FROM game_cells WHERE game_id = $1 AND row = $2 AND col = $3`, [gameId, row, col]);
                }
                // Broadcast cell_updated to ALL sockets in room (including sender)
                const cellUpdatedPayload = { row, col, value: normalised, filledBy: userId, correct };
                io.to(gameId).emit("cell_updated", cellUpdatedPayload);
                // Publish for other server instances
                await redis_1.pub.publish(`channel:game:${gameId}`, JSON.stringify({
                    event: "cell_updated",
                    payload: cellUpdatedPayload,
                    sourceSocketId: s.id,
                }));
                // Check game_complete only when a letter was placed
                if (normalised !== "" && grid) {
                    await checkGameComplete(io, gameId, grid);
                }
            }
            catch (err) {
                logger_1.logger.error({ err }, "[ws] fill_cell error");
            }
        });
        // -----------------------------------------------------------------------
        // move_cursor
        // -----------------------------------------------------------------------
        s.on("move_cursor", async (data) => {
            const parsed = moveCursorSchema.safeParse(data);
            if (!parsed.success) {
                s.emit("error", { message: "Invalid payload" });
                return;
            }
            const { gameId, row, col } = parsed.data;
            try {
                const userId = s.data.user.userId;
                const memberCheck = await pool_1.default.query("SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2", [gameId, userId]);
                if (!memberCheck.rows[0]) {
                    s.emit("error", { error: "Not a participant" });
                    return;
                }
                await (0, redis_1.setCursor)(gameId, userId, row, col);
                const participant = s.data.gameParticipants[gameId];
                const color = participant?.userId === userId ? participant.color : "#888888";
                const cursorMovedPayload = { userId, row, col, color };
                // Broadcast to everyone EXCEPT sender
                s.to(gameId).emit("cursor_moved", cursorMovedPayload);
                // Publish for other server instances (they will broadcast to all their local sockets,
                // none of which is the sender)
                await redis_1.pub.publish(`channel:game:${gameId}`, JSON.stringify({
                    event: "cursor_moved",
                    payload: cursorMovedPayload,
                    sourceSocketId: s.id,
                }));
            }
            catch (err) {
                logger_1.logger.error({ err }, "[ws] move_cursor error");
            }
        });
        // -----------------------------------------------------------------------
        // leave_room
        // -----------------------------------------------------------------------
        s.on("leave_room", async (data) => {
            const parsed = leaveRoomSchema.safeParse(data);
            if (!parsed.success) {
                s.emit("error", { message: "Invalid payload" });
                return;
            }
            const { gameId } = parsed.data;
            try {
                const userId = s.data.user.userId;
                const memberCheck = await pool_1.default.query("SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2", [gameId, userId]);
                if (!memberCheck.rows[0]) {
                    s.emit("error", { error: "Not a participant" });
                    return;
                }
                await s.leave(gameId);
                await (0, redis_1.removeParticipant)(gameId, userId); // Redis-only: cursors + participant set
                const participantLeftPayload = { userId };
                io.to(gameId).emit("participant_left", participantLeftPayload);
                await redis_1.pub.publish(`channel:game:${gameId}`, JSON.stringify({
                    event: "participant_left",
                    payload: participantLeftPayload,
                    sourceSocketId: s.id,
                }));
            }
            catch (err) {
                logger_1.logger.error({ err }, "[ws] leave_room error");
            }
        });
        // -----------------------------------------------------------------------
        // disconnect
        // -----------------------------------------------------------------------
        s.on("disconnect", async () => {
            logger_1.logger.info(`[ws] Socket disconnected: ${s.id}`);
            const userId = s.data?.user?.userId;
            if (!userId)
                return;
            // Clean up all rooms this socket was participating in
            for (const gameId of s.rooms) {
                if (gameId === s.id)
                    continue; // skip the socket's own default room
                try {
                    await (0, redis_1.removeParticipant)(gameId, userId);
                    const participantLeftPayload = { userId };
                    io.to(gameId).emit("participant_left", participantLeftPayload);
                    await redis_1.pub.publish(`channel:game:${gameId}`, JSON.stringify({
                        event: "participant_left",
                        payload: participantLeftPayload,
                        sourceSocketId: s.id,
                    }));
                }
                catch (err) {
                    logger_1.logger.error({ err }, `[ws] disconnect cleanup error for game ${gameId}`);
                }
            }
        });
    });
}
// ---------------------------------------------------------------------------
// Game complete check
// ---------------------------------------------------------------------------
async function checkGameComplete(io, gameId, grid) {
    const stateHash = await (0, redis_1.getGameState)(gameId);
    // Build a map of correct answers from the grid
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
            const expected = grid[r][c];
            if (expected === null)
                continue; // black cell, skip
            const entry = stateHash[`${r}:${c}`];
            if (!entry)
                return; // cell not yet filled
            let parsed;
            try {
                parsed = JSON.parse(entry);
            }
            catch {
                return;
            }
            if (parsed.value !== expected.toUpperCase())
                return; // wrong answer
        }
    }
    // All cells correctly filled — update postgres and emit game_complete
    const now = new Date().toISOString();
    const result = await pool_1.default.query(`UPDATE games SET status = 'complete', completed_at = now() WHERE id = $1 AND status != 'complete'`, [gameId]);
    if (result.rowCount === 0)
        return;
    // Compute per-user stats from Redis state
    const statsMap = {};
    for (const json of Object.values(stateHash)) {
        try {
            const { filledBy } = JSON.parse(json);
            statsMap[filledBy] = (statsMap[filledBy] ?? 0) + 1;
        }
        catch {
            // skip
        }
    }
    const stats = Object.entries(statsMap).map(([userId, cellsFilled]) => ({
        userId,
        cellsFilled,
    }));
    const gameCompletePayload = { completedAt: now, stats };
    io.to(gameId).emit("game_complete", gameCompletePayload);
    await redis_1.pub.publish(`channel:game:${gameId}`, JSON.stringify({
        event: "game_complete",
        payload: gameCompletePayload,
        sourceSocketId: "__server__",
    }));
    // Clean up Redis keys
    await (0, redis_1.deleteGameKeys)(gameId);
}
//# sourceMappingURL=handlers.js.map