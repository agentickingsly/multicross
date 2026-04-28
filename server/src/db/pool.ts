import { Pool } from "pg";

const pool = new Pool(
  process.env.DB_USER
    ? {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST ?? "localhost",
        port: Number(process.env.DB_PORT ?? 5432),
        database: process.env.DB_NAME,
      }
    : { connectionString: process.env.DATABASE_URL }
);

export default pool;
