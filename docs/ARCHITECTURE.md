# Decade Conviction Assistant — v1 Architecture (Agentic)

> This document is the source of truth for v1. Read this before making architectural decisions. Code should follow these patterns; deviations need explicit justification.
>
> **This is the agentic design.** The LLM drives orchestration via tool calls. There is no procedural pipeline that calls retrieve → rerank → classify → generate in a fixed order. If you find yourself writing such a pipeline, you're building the wrong thing.

## 1. Problem Statement

Build a conversational AI assistant that answers investment questions **strictly grounded on Decade's conviction documents**. When a topic is covered by convictions, answers come exclusively from those documents. When it isn't, the assistant answers from general knowledge with a visible disclaimer.

**Hard requirements:**
1. Strict grounding on conviction documents for in-scope questions.
2. Provider/model portability — switching LLMs is a config change, not a rewrite.
3. Multilingual — respond in the user's language regardless of document language.

**Bonus:** Handle user-uploaded PDF and Excel files in conversation (single-turn, never added to corpus).

## 2. Why Agentic

The architecture is built around a tool-using LLM that decides when to retrieve, what to retrieve, when to read full documents, and when it has enough evidence to answer. This is intentional and worth justifying:

- **Scales with model improvements.** As frontier models get better at tool use and reasoning, the system improves without code changes. The deterministic alternative requires architectural rewrites to capture those gains.
- **Natural handling of multi-step queries.** "Compare CDB and CRA/CRI tax treatment" decomposes into multiple retrievals naturally; in a deterministic single-shot design it requires explicit query decomposition logic.
- **Simpler orchestration code.** The agent loop replaces what would otherwise be procedural retrieve/rerank/route/branch/generate logic.
- **Aligns with where the field is going.** OpenAI Responses API, Anthropic tool use, AI SDK v6's `Agent` abstraction — the major providers are converging on tool-loop primitives as the default unit of LLM application.

**Tradeoffs we are explicitly accepting:**

| Cost | Mitigation |
|---|---|
| 2–4× per-query LLM cost vs. deterministic | Use Claude Haiku for ingestion-time tasks; reserve Sonnet for the agent loop. |
| Higher latency (3–8s vs. 1–2s) | Stream tool calls and tool results; show progress in UI; cap loop iterations. |
| Non-deterministic flow | Strong system prompt + post-validation + eval harness designed for non-determinism. |
| Risk of under-retrieval (agent skips tools) | System prompt mandates tool use for investment questions; validation layer enforces. |
| Harder to debug | First-class observability: log every tool call, every result, every step. |

## 3. Scope and Constraints

| Aspect | v1 Decision |
|---|---|
| Corpus size | ~30 Markdown documents today, growing. Total ~60–120K tokens. |
| Document format | Markdown memos, mostly text with simple tables. Future formats flagged for v2. |
| Document languages | Primarily PT and EN, mixed; not exclusively. |
| Authority of convictions | Source of truth. Assistant speaks confidently in Decade's voice. |
| Citation style | `Sources:` footer with filenames. No verbatim quoting required. |
| Out-of-scope behavior | Answer from general knowledge with visible disclaimer. Never hard-refuse. |
| File uploads | Single-turn injection only. Separate retrieval namespace. Never persisted. |
| Auth / multi-tenancy | Out of scope for v1. Single-tenant test deployment. |
| Conversation memory | Stateless across sessions; multi-turn via message history in request. |
| Agent loop bound | Maximum 10 steps per query. Most resolve in 2–4. |

## 4. Tech Stack

- **Language:** TypeScript (Node.js, ≥20).
- **API framework:** Hono.
- **LLM abstraction:** Vercel AI SDK (`ai` package + provider packages `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`). The AI SDK's `generateText` with `tools` and `stopWhen` is the agent loop primitive.
- **Default model:** Claude Sonnet 4.5 (`anthropic('claude-sonnet-4-5')`) for the agent loop.
- **Cheap model:** Claude Haiku 4.5 for ingestion-time contextualization.
- **Embeddings:** OpenAI `text-embedding-3-large` (3072 dims, multilingual, swappable).
- **Vector store:** Postgres + `pgvector`. HNSW index. Drizzle ORM.
- **Sparse search:** Postgres `tsvector` with `portuguese` and `english` configurations.
- **Reranker:** Cohere Rerank 3.5 (multilingual) wrapped behind a `Reranker` interface.
- **PDF parsing (uploads):** `unpdf` for v1. Docling/LlamaParse flagged as v2.
- **Excel parsing (uploads):** `xlsx` (SheetJS) for v1.
- **Validation:** Zod schemas for request/response and tool input/output schemas.
- **Eval harness:** Custom runner over a JSON golden set; LLM-as-judge metrics.
- **Observability:** Structured logging of every tool call (input, output, latency) per request.

## 5. Architecture Overview

```
                        ┌──────────────────┐
        request ───────▶│  POST /chat      │
                        │  (Hono)          │
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────────┐
                        │   Agent loop         │
                        │  (AI SDK             │
                        │   generateText       │
                        │   + tools            │
                        │   + stopWhen)        │
                        └──┬───────────────┬───┘
                           │               │
              tool calls ◀─┘               └─▶ final answer
                  │                                    │
                  ▼                                    ▼
        ┌────────────────────┐              ┌──────────────────┐
        │  Tools             │              │  Validation      │
        │  - search_         │              │  - did agent use │
        │    convictions     │              │    tools?        │
        │  - read_document   │              │  - sources real? │
        │  - list_documents  │              │  - disclaimer if │
        │  - parse_upload    │              │    no tools?     │
        └────────────────────┘              └──────────┬───────┘
                                                       │
                                                       ▼
                                              streamed response
```

The agent sees the user's query, the conversation history, and a system prompt encoding Decade's grounding rules. It chooses which tools to call. The AI SDK manages the loop; we cap it at `stepCountIs(10)`.

## 6. Module Structure

```
src/
  api/
    chat.ts                  # POST /chat handler — invokes agent
    upload.ts                # multipart handler for PDF/XLSX
  agent/
    loop.ts                  # generateText({ tools, stopWhen, ... })
    systemPrompt.ts          # the agent's behavioral contract
    validate.ts              # post-generation validation layer
  tools/
    searchConvictions.ts     # hybrid retrieval + rerank
    readDocument.ts          # fetch full document by id
    listDocuments.ts         # catalog of available convictions
    parseUpload.ts           # process per-turn uploaded files
    index.ts                 # tool registry; assembles tools per request
  providers/
    llm.ts                   # LLMProvider interface
    embeddings.ts            # EmbeddingProvider interface
    reranker.ts              # Reranker interface
  retrieval/
    pgvector.ts              # dense search
    tsvector.ts              # sparse search
    hybrid.ts                # RRF fusion
  ingestion/
    parse.ts                 # markdown → chunks
    contextualize.ts         # Anthropic contextual-retrieval pre-step
    embed.ts                 # batch embedding
    index.ts                 # write to Postgres
    cli.ts                   # `npm run ingest` entrypoint
  uploads/
    pdf.ts                   # unpdf wrapper
    xlsx.ts                  # SheetJS wrapper
    parse.ts                 # uniform parsing interface
    session.ts               # per-request upload registry (in-memory)
  prompts/
    agentSystem.ts           # the system prompt
    contextualize.ts         # for indexing pipeline
  eval/
    runner.ts                # eval harness
    metrics.ts               # faithfulness, tool-call quality, scope
    golden.json              # 30–50 test cases
  observability/
    trace.ts                 # structured per-request trace logger
  config.ts                  # env vars, model IDs, top-k values
  db/
    schema.ts                # Drizzle schema
    migrations/
docs/
  ARCHITECTURE.md            # this file
  README.md                  # user-facing
data/
  convictions/               # source markdown files
```

**Rule:** application code (anything in `agent/`, `api/`, `tools/`) imports only from `providers/`. Direct AI SDK imports outside `providers/` and `agent/loop.ts` are a code-review red flag. The single permitted use of AI SDK outside `providers/` is in `agent/loop.ts`, because the agent loop is intrinsically tied to the SDK's `generateText` + `tools` primitive.

## 7. Data Model

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id            TEXT PRIMARY KEY,           -- e.g., "cdbs_quick_guide"
  filename      TEXT NOT NULL,
  language      TEXT NOT NULL,              -- 'pt' | 'en' | other
  title         TEXT,
  summary       TEXT,                       -- 1–2 sentence; used by list_documents
  content_md    TEXT NOT NULL,              -- full source for read_document
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chunks (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   INT NOT NULL,
  content       TEXT NOT NULL,
  contextual    TEXT NOT NULL,              -- chunk + LLM-generated context
  embedding     VECTOR(3072),
  tsv_pt        TSVECTOR,
  tsv_en        TSVECTOR,
  metadata      JSONB
);

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv_pt_idx ON chunks USING gin (tsv_pt);
CREATE INDEX chunks_tsv_en_idx ON chunks USING gin (tsv_en);
```

Note the addition of `documents.summary`. The `list_documents` tool returns title + summary so the agent can decide which documents are worth retrieving from before issuing a search. Summaries are generated once at ingestion time by Haiku.

## 8. Provider Abstraction

```typescript
// providers/llm.ts
export interface LLMProvider {
  // Used by the agent loop in agent/loop.ts
  agentModel: LanguageModel;       // AI SDK LanguageModel
  classifierModel: LanguageModel;  // for ingestion-time tasks (summaries, contexts)
}

// providers/embeddings.ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

// providers/reranker.ts
export interface Reranker {
  rerank(query: string, documents: string[], topK: number): Promise<RerankResult[]>;
}
```

Selection in `config.ts`:

```typescript
export const llm: LLMProvider = {
  agentModel: anthropic('claude-sonnet-4-5'),
  classifierModel: anthropic('claude-haiku-4-5'),
};
```

Switching providers is one line. The AI SDK handles tool-call protocol differences across Anthropic, OpenAI, and Google natively, so the agent loop in `agent/loop.ts` does not change when models swap.

## 9. The Agent Loop

In `agent/loop.ts`:

```typescript
import { generateText, stepCountIs } from 'ai';

export async function runAgent({
  messages,
  uploads,
  trace,
}: AgentArgs): Promise<AgentResult> {
  const tools = buildTools({ uploads, trace });

  const result = await generateText({
    model: llm.agentModel,
    system: agentSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(10),
    onStepFinish: ({ toolCalls, toolResults }) => {
      trace.recordStep({ toolCalls, toolResults });
    },
  });

  return validateAndFinalize(result, trace);
}
```

That's the entirety of the orchestration. The model decides what to call. The AI SDK runs the loop.

**Why `stopWhen: stepCountIs(10)`:** a hard cap on iterations protects against runaway loops if the model gets confused. Most queries finish in 2–4 steps. Hitting 10 is a signal that something is wrong; logged as a warning.

## 10. The Tools

Four tools, defined with Zod schemas the AI SDK enforces.

### `search_convictions`

```typescript
{
  description: "Search Decade's conviction documents using hybrid (semantic + keyword) retrieval. Returns the most relevant chunks with document IDs and snippets. Use this whenever the user asks an investment question; you may call multiple times with refined queries.",
  inputSchema: z.object({
    query: z.string().describe('Search query. Be specific and use the same language as the user.'),
    language_hint: z.enum(['pt', 'en', 'auto']).default('auto').describe('Hint to bias toward Portuguese or English documents.'),
    top_k: z.number().int().min(1).max(20).default(8),
  }),
  execute: async ({ query, language_hint, top_k }) => {
    const chunks = await hybridRetrieve(query, { language_hint, k: 30 });
    const reranked = await reranker.rerank(query, chunks.map(c => c.content), top_k);
    return reranked.map(r => ({
      document_id: r.metadata.document_id,
      chunk_id: r.metadata.chunk_id,
      content: r.content,
      score: r.score,
    }));
  },
}
```

### `read_document`

```typescript
{
  description: 'Read the full content of a specific conviction document. Use when search results are too fragmented to answer well, or when you need broader context than chunks provide.',
  inputSchema: z.object({
    document_id: z.string(),
  }),
  execute: async ({ document_id }) => {
    const doc = await db.documents.findById(document_id);
    if (!doc) return { error: `Document ${document_id} not found.` };
    return { id: doc.id, title: doc.title, language: doc.language, content: doc.content_md };
  },
}
```

### `list_documents`

```typescript
{
  description: 'List all available conviction documents with their titles and one-line summaries. Use to orient yourself on what topics Decade has convictions about, especially when you suspect a topic may be out of scope.',
  inputSchema: z.object({
    topic_filter: z.string().optional().describe('Optional keyword filter applied to titles and summaries.'),
  }),
  execute: async ({ topic_filter }) => {
    const docs = await db.documents.list({ topic_filter });
    return docs.map(d => ({ id: d.id, title: d.title, language: d.language, summary: d.summary }));
  },
}
```

### `parse_upload`

Only registered for the request when uploads are present.

```typescript
{
  description: "Parse a user-uploaded file (PDF or Excel) and return its content. Files are scoped to this turn only and are not part of Decade's conviction corpus.",
  inputSchema: z.object({
    file_id: z.string(),
  }),
  execute: async ({ file_id }) => {
    const upload = uploadSession.get(file_id);
    if (!upload) return { error: `Upload ${file_id} not found.` };
    return { filename: upload.filename, content: upload.parsed };
  },
}
```

**Why these four and not more.** Resist composite tools like `compare_documents` or `summarize_corpus`. The agent composes them from primitives. Adding tools makes the agent's decision space larger and harder to reason about; four primitives covers v1 cleanly.

## 11. The System Prompt

The system prompt is the most important artifact in the agentic design. It encodes Decade's grounding rules. Sketch (final version lives in `prompts/agentSystem.ts`):

```
You are Decade's investment research assistant. You answer questions about
investments using Decade's institutional convictions, which you access through
tools.

# Your Tools

- search_convictions: hybrid search over Decade's conviction documents. Use
  this for any investment question.
- read_document: fetch a full conviction document when search snippets are
  insufficient.
- list_documents: see the full catalog of convictions to check coverage.
- parse_upload: read a user-uploaded file (only available when an upload
  exists in this turn).

# Grounding Rules — Read Carefully

1. For ANY question about investments, financial instruments, taxation,
   markets, or any topic Decade might have a conviction on: you MUST call
   search_convictions before answering. Do not answer from your own knowledge
   without first checking the convictions.

2. If search results clearly cover the question: answer using only the
   convictions. Speak in Decade's voice — confident, declarative, authoritative.
   Do not say "according to Decade" or "this document states"; just assert.
   End with a "Sources:" footer listing the document IDs you used.

3. If search results are thin, ambiguous, or partially relevant:
   - Try refined queries first (different wording, decompose into sub-queries).
   - Consider list_documents to see if a relevant document exists you missed.
   - Consider read_document for fuller context on a borderline match.
   - Only conclude "out of scope" after you have actually checked.

4. If after checking, the topic is genuinely not covered by Decade's
   convictions: answer from general knowledge, but BEGIN your response with
   the disclaimer (translated to the user's language):
   "⚠️ This topic isn't covered by Decade's convictions. Answering from
   general knowledge."
   Do not include a "Sources:" footer in this case.

5. For questions partially covered by convictions: answer the covered part
   from convictions (with sources) and explicitly flag the uncovered part
   with the same disclaimer style. Do not blend covered and uncovered claims
   silently.

6. Respond in the user's language regardless of the convictions' languages.
   When citing, cite the document IDs as-is (do not translate filenames).

7. For questions clearly unrelated to investments (greetings, off-topic
   chit-chat): respond naturally without invoking tools.

# User Uploads

When a user uploads a file in this turn, the parse_upload tool is available.
Treat uploaded content as ephemeral context for THIS turn only. It is not
part of Decade's convictions. If you cite from an upload, prefix the source
as "uploaded/<filename>" to distinguish it from conviction documents.

# Voice

Decade's research is the source of truth for in-scope topics. Speak with
ownership. The convictions are Decade's positions, not external opinions
to attribute.
```

Iterate on this prompt during eval. It is the single highest-leverage piece of code in the system.

## 12. Validation Layer

In `agent/validate.ts`, run after the agent loop completes, before streaming the response back:

1. **Tool-use check.** If the user's query was an investment question (a cheap heuristic or a Haiku check) and the agent called zero tools, log a warning. Optionally re-prompt with a corrective message ("You did not check the convictions. Please call search_convictions before answering.").
2. **Source attribution check.** If the response contains a `Sources:` footer, parse it and verify every cited document ID was actually returned by a tool call in this run. Strip hallucinated IDs.
3. **Disclaimer check.** If no tools were called or all tool calls returned irrelevant results, verify the disclaimer is present. Inject if missing.
4. **Language check.** Detect the response language; if it doesn't match the user's input language, log a warning. Don't block — language detection is noisy.

Validation is lightweight and runs locally without LLM calls (except optionally the corrective re-prompt, which only fires on actual violations).

## 13. Ingestion Pipeline

Run via `npm run ingest`. Idempotent.

1. Read `data/convictions/*.md`.
2. Parse + detect language with `franc`.
3. **Generate summary** (1–2 sentences) per document via Haiku — used by `list_documents`.
4. Chunk by Markdown structure: split on H2/H3, target 500–800 tokens, sliding window fallback.
5. Contextualize each chunk via Haiku with Anthropic prompt caching on the parent document (~90% cost reduction on repeated chunks of the same doc).
6. Embed `contextual` text via `text-embedding-3-large`.
7. Insert `documents` (with `summary`) and `chunks` rows. Compute `tsv_pt` and `tsv_en`.
8. Sanity-check query at the end.

Re-running ingest: replace rows for documents whose content hash changed; leave others untouched.

## 14. Hybrid Retrieval

Used by the `search_convictions` tool, not directly by the agent loop.

1. Embed query.
2. Dense top 30 via pgvector cosine similarity.
3. Sparse top 30 via `ts_rank_cd` against the `language_hint`-matching tsvector (or both languages unioned if hint is `auto` or unmatched).
4. RRF fusion (`k=60`, equal weights). Output top 30.
5. Cohere Rerank 3.5 → top 8 (or whatever the tool's `top_k` argument requested).

Tunable via `config.ts`.

## 15. File Uploads (Bonus)

`POST /chat` accepts multipart with optional file attachments. Per-request flow:

1. Parse PDF with `unpdf`, XLSX with `xlsx` (each sheet → Markdown table).
2. Register parsed content in an in-memory upload session keyed by request ID. Each upload gets a `file_id`.
3. Inject a system message into the agent context: *"The user has uploaded the following files in this turn: [filename, file_id, brief description]. You can read them via the parse_upload tool."*
4. The agent decides whether and when to call `parse_upload`.
5. After the request completes, drop the session. Files are never persisted.

For files larger than ~50K tokens, truncate on parse with a note in the description. v2 will route large uploads to per-session ephemeral vector indexes.

## 16. Observability

Every request gets a `trace` object that captures:

- Request ID, timestamp, user message, detected language.
- Each agent step: tool calls, tool inputs, tool outputs (truncated), latency.
- Final response, validation results, total tokens, total cost.

Logged as structured JSON. For v1, console + a JSONL file is sufficient. For v2, ship to Langfuse, Helicone, or similar.

This is non-optional. Agentic systems are debuggable only insofar as their traces are. A request with surprising output should be reproducible from its trace alone.

## 17. Evaluation

`npm run eval` runs `eval/golden.json` through the full agent pipeline and reports:

- **Faithfulness** (LLM-as-judge: are response claims supported by tool outputs in the trace?). The single most important metric.
- **Scope behavior** (did the agent treat in-scope queries as in-scope, out-of-scope as out-of-scope?). Measured by: did the agent retrieve? Did it cite? Did it disclaim when appropriate?
- **Source precision** (cited document IDs are real and were actually retrieved in the trace).
- **Tool-call efficiency** (steps used vs. minimum needed). Identifies prompts where the agent thrashes.
- **Disclaimer presence** for out-of-scope.
- **Language match** between input and output.

Golden set composition (target ~50 cases):
- 15 in-scope PT (varied: factual lookup, comparison, application).
- 15 in-scope EN (same).
- 5 cross-lingual (PT user asking about EN doc, vice versa).
- 10 out-of-scope (must disclaim).
- 5 borderline (partially covered).

CI runs eval on PRs. Faithfulness regression > 2 percentage points blocks merge.

## 18. Forward-Looking Swap Points

Each is a single-file or single-module change.

| Future event | Change |
|---|---|
| Switch primary model | `config.ts`: change `agentModel`. AI SDK handles tool-call protocol. |
| Switch embeddings | `config.ts` + `npm run ingest` to re-index. |
| Adopt Anthropic Citations API | New `LLMProvider` method; `agent/loop.ts` gains a citation-aware mode. |
| Add new tool (e.g., `web_search`, `fetch_market_data`) | Add to `tools/`, register in `tools/index.ts`. |
| GraphRAG for synthesis queries | Add as a tool: `synthesize_themes(topic)`. Agent learns to use it. |
| Frontier model becomes cheap enough to skip RAG | `search_convictions` falls back to "stuff full corpus" internally. Tool interface unchanged. |
| Multi-turn memory across sessions | Add `sessions` table; agent gets a `recall_session(id)` tool. |

The agentic shape is durable. Most evolutions are tool additions, not architectural rewrites.

## 19. Pragmatic Limitations to Flag in README

- Cohere Rerank is a managed API → flag rate limits and propose self-hosted `bge-reranker-v2-m3` as a swap.
- Single-Postgres deployment doesn't scale past ~1M chunks → flag horizontal-scale path.
- Eval harness uses LLM-as-judge → flag the cost; propose RAGAS or ARES for v2.
- File uploads are in-memory only → flag the path to ephemeral per-session indexes.
- No conversation persistence → flag the path to a sessions table.
- No streaming UI in v1 — API streams, but reference UI is minimal.
- No prompt caching on the agent loop in v1. Anthropic caching on multi-turn agent calls is doable; flagged as an early optimization.

## 20. Out of Scope for v1

- Authentication, RBAC, multi-tenancy.
- Persistent conversation history across sessions.
- Fine-tuning of any kind.
- GraphRAG, ColPali, two-stage verification, Self-RAG — flagged in README as v2 candidates.
- Composite tools (`compare`, `summarize_corpus`). The agent composes from primitives.
- Streaming UI beyond a minimal reference page.

## 21. Build Order

For Claude Code, in this sequence:

1. Repo scaffold + `package.json` + TS config + Drizzle schema + first migration.
2. Provider interfaces with AI SDK + Anthropic + OpenAI implementations. No business logic.
3. Ingestion pipeline + `npm run ingest` CLI. Test on the sample documents.
4. Hybrid retrieval module (used by the `search_convictions` tool).
5. Tool implementations (`search_convictions`, `read_document`, `list_documents`).
6. Agent loop + system prompt + validation layer.
7. `POST /chat` API endpoint.
8. Observability (trace logger).
9. Eval harness + golden set.
10. File upload handling (`parse_upload` tool + multipart endpoint).
11. README polish.
