/** Standalone migration runner: `bun run db:migrate`. */
import { runMigrations } from "./client.ts";

runMigrations();
console.log("✓ migrations applied");
