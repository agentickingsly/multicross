import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { ClientToServerEvents, ServerToClientEvents } from "@multicross/shared";

import { logger } from "./logger";
import pool from "./db/pool";
import { requireAuth, requireNotBanned, requireAdmin, optionalAuth } from "./middleware/auth";
import authRouter from "./routes/auth";
import puzzlesRouter from "./routes/puzzles";
import gamesRouter from "./routes/games";
import adminRouter from "./routes/admin";
import friendsRouter from "./routes/friends";
import invitesRouter from "./routes/invites";
import usersRouter from "./routes/users";
import statsRouter from "./routes/stats";
import { registerWsHandlers } from "./ws/handlers";
import { startExpiryJob } from "./jobs/expiry";

const app = express();
app.set('trust proxy', 1);
app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "16kb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const statsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", message: "Database unavailable" });
  }
});

if (process.env.NODE_ENV !== "test") {
  app.use("/api/auth", authLimiter);
  app.use("/api/users", statsLimiter);
}
app.use("/api/auth", authRouter);
app.use("/api/puzzles", requireAuth, requireNotBanned, puzzlesRouter);
app.use("/api/games", requireAuth, requireNotBanned, gamesRouter);
app.use("/api/friends", requireAuth, requireNotBanned, friendsRouter);
app.use("/api/invites", requireAuth, requireNotBanned, invitesRouter);
app.use("/api/users", optionalAuth, statsRouter);
app.use("/api/users", requireAuth, requireNotBanned, usersRouter);
app.use("/api/admin", requireAuth, requireNotBanned, requireAdmin, adminRouter);

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("/{*path}", (req, res) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
      res.sendFile(path.join(clientDist, "index.html"));
    }
  });
}

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export { app };

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  logger.error("FATAL: JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

if (process.env.NODE_ENV !== "test") {
  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
  });
  registerWsHandlers(io);
  startExpiryJob();

  const PORT = process.env.PORT ?? 3001;
  httpServer.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
  });
}
