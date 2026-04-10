import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { ClientToServerEvents, ServerToClientEvents } from "@multicross/shared";

import authRouter from "./routes/auth";
import puzzlesRouter from "./routes/puzzles";
import gamesRouter from "./routes/games";
import { registerWsHandlers } from "./ws/handlers";

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL ?? "http://localhost:5173" }));
app.use(express.json({ limit: "16kb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", authLimiter);
app.use("/api/auth", authRouter);
app.use("/api/puzzles", puzzlesRouter);
app.use("/api/games", gamesRouter);

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: process.env.CLIENT_URL ?? "http://localhost:5173" },
});

registerWsHandlers(io);

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  console.error("FATAL: JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
