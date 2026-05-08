# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A take-home build of "Decade's investment research assistant" — a conversational AI strictly grounded on Decade's conviction documents (Markdown memos in `data/convictions/`, mostly PT/EN). The brief is in `AI_CHALLENGE.md`; the v1 design is in `docs/ARCHITECTURE.md` and is the source of truth — read it before any architectural decision.

The current state is a typed scaffold: directory shape, types, schema, and migrations are in place; nearly every `execute`/`run` body throws `not implemented`. Follow the build order in §21 of `docs/ARCHITECTURE.md` rather than filling things in opportunistically.

## Architecture you cannot infer from the file tree

**Agentic, not procedural.** The LLM drives orchestration via tool calls. There is **no** `pipeline/` that calls retrieve → rerank → classify → generate in sequence. If you find yourself writing one, stop — you're building the wrong thing. The agent loop (`src/agent/loop.ts`) calls `generateText({ tools, stopWhen: stepCountIs(10) })` and that's the entire orchestration; tool selection is the model's job.

**Import discipline (§6 rule, enforced by review):** code in `agent/`, `api/`, and `tools/` may import LLM/embedding/reranker capabilities **only** from `providers/`. The single permitted importer of `generateText`/`tool`/etc. from the `ai` package outside `providers/` is `src/agent/loop.ts`. Any other direct `ai` import is a red flag.

**Highest-leverage file:** `src/prompts/agentSystem.ts` (currently empty). The §11 template is the contract that enforces grounding, scope, citations, language matching, and the OOS disclaimer. Iterate on it during eval — small wording changes here move faithfulness more than code changes elsewhere.

**Validation runs after the loop, not during.** `src/agent/validate.ts` strips hallucinated `Sources:` filenames, injects the disclaimer when no tools were called, and warns on language mismatch. Don't try to enforce these inside the agent prompt alone.

**Tools are primitives, not composites.** Four total: `search_convictions`, `read_document`, `list_documents`, `parse_upload` (registered only when uploads are present). Resist `compare_documents`, `summarize_corpus`, etc. — the agent composes from primitives. See §10 for descriptions and zod input schemas (which are already in `src/tools/*.ts` verbatim).

**Observability is non-optional.** Every request gets a `Trace` (`src/observability/trace.ts`) capturing each tool call's input/output/latency. Agentic systems are debuggable only insofar as their traces are; a surprising output should be reproducible from its trace alone.

## DB and migrations

Migrations are **hand-rolled SQL** in `src/db/migrations/` and applied by a custom runner (`src/db/migrate.ts`) that tracks applied IDs in a `_migrations` table. They are intentionally NOT drizzle-kit-generated: `0000_init.sql` mirrors §7 verbatim (including `CREATE EXTENSION vector` which drizzle-kit does not emit). When schema changes, write a new sequential `NNNN_description.sql` file — do not edit `0000_init.sql`.

`npm run db:generate` works but creates a parallel `0000_*.sql` plus a `meta/` snapshot dir that collide with the hand-rolled flow. If you run it for inspection, delete the artifacts after.

**Known issue carried in `0000_init.sql`:** pgvector's HNSW caps at 2000 dims for `vector` (4000 for `halfvec`). `VECTOR(3072) USING hnsw` will fail on pgvector ≤0.8. The fix is `halfvec(3072)` — flagged but not yet applied.

## Commands

- `npm run typecheck` — `tsc --noEmit`. Run this after touching types; it's the quickest signal the scaffold is still consistent.
- `npm run dev` — `tsx watch src/server.ts`. Note: `src/server.ts` doesn't exist yet (added during build-order step 7). Don't run this until then.
- `npm run db:migrate` — applies `src/db/migrations/*.sql` in order, in transactions, via the custom runner. Requires `DATABASE_URL`.
- `npm run db:studio` — drizzle-kit studio for inspecting the DB.
- `npm run ingest` — `tsx src/ingestion/cli.ts`. Stubbed; build-order step 3.
- `npm run eval` — `tsx src/eval/runner.ts`. Stubbed; build-order step 9.
- No `test` script yet. `vitest` is installed; add it when writing tests.

## Conventions

- **ESM + NodeNext.** Local imports must include the `.js` extension (e.g. `from './schema.js'`) even though source files are `.ts`. `tsconfig.json` is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Stub bodies throw `new Error('not implemented')`.** Don't replace them with no-ops, mocks, or partial impls — types stay honest by failing loudly until the real implementation lands.
- **Provider/model selection lives only in `src/config.ts`.** Switching LLMs should be a one-line change there per §8/§18, not a refactor.
- **Run the build order from §21 in sequence.** Skipping ahead (e.g., wiring the agent loop before tools work) creates cascading rewrites because each layer depends on the previous one's contracts.
