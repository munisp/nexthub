import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./drizzle/nqr_schema.ts",
    "./drizzle/tenant_schema.ts",
    "./drizzle/national_switch_schema.ts",
    "./drizzle/schema.ts",
  ],
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://nexthub:password@localhost:5432/nexthub_db",
  },
  verbose: true,
  strict: true,
});
