import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/nexthub_schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://nexthub:password@localhost:5432/nexthub_db",
  },
  verbose: true,
  strict: true,
});
