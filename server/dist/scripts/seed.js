"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const pool_1 = __importDefault(require("../db/pool"));
const logger_1 = require("../logger");
async function seed() {
    logger_1.logger.info("Seed script — not yet implemented.");
    // TODO: Session 5 — insert sample puzzles from .puz / .ipuz files
    await pool_1.default.end();
}
seed().catch((err) => {
    logger_1.logger.error(err);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map