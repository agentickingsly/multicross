import { runMigrations } from "../db/migrate";

beforeAll(async () => {
  await runMigrations();
}, 30_000);
