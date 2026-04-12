import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

// Load server/.env for local dev — CI env vars take precedence (dotenv never overrides)
dotenv.config({ path: path.resolve(__dirname, ".env") });
// Suppress invite-code gate in tests (dotenv won't override an existing — even empty — var)
process.env.INVITE_CODE = "";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
