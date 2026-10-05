/**
 * Produce a static client bundle in `dist/`.
 *
 * `bun run start` already serves the app (Bun bundles the HTML entrypoint at
 * boot and caches it), so this is only needed when you want to host the
 * frontend separately — behind a CDN, for example — and point it at the API.
 */
import tailwind from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["apps/web/index.html"],
  outdir: "dist",
  plugins: [tailwind],
  minify: true,
  sourcemap: "linked",
  target: "browser",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const total = result.outputs.reduce((sum, output) => sum + output.size, 0);
for (const output of result.outputs) {
  console.log(`  ${output.path.replace(`${process.cwd()}/`, "")}  ${(output.size / 1024).toFixed(1)} kB`);
}
console.log(`\n✓ built ${result.outputs.length} file(s), ${(total / 1024).toFixed(1)} kB total`);
