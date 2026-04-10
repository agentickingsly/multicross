"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env") });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const logger_1 = require("./logger");
const pool_1 = __importDefault(require("./db/pool"));
const auth_1 = __importDefault(require("./routes/auth"));
const puzzles_1 = __importDefault(require("./routes/puzzles"));
const games_1 = __importDefault(require("./routes/games"));
const handlers_1 = require("./ws/handlers");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: process.env.CLIENT_URL ?? "http://localhost:5173" }));
app.use(express_1.default.json({ limit: "16kb" }));
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many attempts, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
});
app.get("/health", async (_req, res) => {
    try {
        await pool_1.default.query("SELECT 1");
        res.json({ status: "ok", timestamp: new Date().toISOString() });
    }
    catch {
        res.status(503).json({ status: "error", message: "Database unavailable" });
    }
});
app.use("/api/auth", authLimiter);
app.use("/api/auth", auth_1.default);
app.use("/api/puzzles", puzzles_1.default);
app.use("/api/games", games_1.default);
if (process.env.NODE_ENV === "production") {
    const clientDist = path_1.default.join(__dirname, "../../client/dist");
    app.use(express_1.default.static(clientDist));
    app.get("*", (req, res) => {
        if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
            res.sendFile(path_1.default.join(clientDist, "index.html"));
        }
    });
}
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL ?? "http://localhost:5173" },
});
(0, handlers_1.registerWsHandlers)(io);
// Global error handler
app.use((err, _req, res, _next) => {
    logger_1.logger.error(err);
    res.status(500).json({ error: "Internal server error" });
});
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
    logger_1.logger.error("FATAL: JWT_SECRET must be at least 32 characters");
    process.exit(1);
}
const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
    logger_1.logger.info(`Server listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map