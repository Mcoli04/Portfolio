"use strict";

/**
 * Preload script for the standalone workers (worker:ingest, worker:apply).
 *
 * The Next.js app loads .env.local automatically, but a standalone `tsx`
 * script does not. Loading .env.local from inside the worker file itself
 * doesn't work either: tsx/esbuild hoists a worker's `import` statements
 * above any other top-level code in that file (matching real ESM import
 * semantics), so by the time an in-file env-loading call would run, modules
 * like src/lib/config.ts have already read process.env at their own
 * module-evaluation time and captured `undefined`.
 *
 * Passing this file via `tsx --require` guarantees it runs before the
 * worker's module graph is loaded at all, sidestepping that hoisting issue
 * entirely — the same role `dotenv/config` plays when preloaded with
 * `node -r dotenv/config`. No new dependency is needed: process.loadEnvFile
 * is Node's own built-in equivalent of dotenv's loader.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not present (e.g. CI/production, where real env vars are
  // injected directly into the environment) — fall back to whatever the
  // process environment already has.
}
