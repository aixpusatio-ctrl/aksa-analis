import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./apps/server/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/scraper.db",
  },
  verbose: true,
  strict: true,
});
