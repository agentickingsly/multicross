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
const auth_1 = __importDefault(require("./routes/auth"));
const puzzles_1 = __importDefault(require("./routes/puzzles"));
const games_1 = __importDefault(require("./routes/games"));
const handlers_1 = require("./ws/handlers");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: process.env.CLIENT_URL ?? "http://localhost:5173" }));
app.use(express_1.default.json());
app.use("/api/auth", auth_1.default);
app.use("/api/puzzles", puzzles_1.default);
app.use("/api/games", games_1.default);
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL ?? "http://localhost:5173" },
});
(0, handlers_1.registerWsHandlers)(io);
// Global error handler
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});
const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map