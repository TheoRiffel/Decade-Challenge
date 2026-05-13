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
- **Embeddings:** `BAAI/bge-m3` (1024 dims, multilingual) served via HF Text Embeddings Inference (TEI). Wrapped behind an `EmbeddingProvider` interface; an OpenAI factory remains for portability.
- **Vector store:** Postgres + `pgvector`. HNSW index (within the 2000-dim cap thanks to bge-m3's 1024 dims). Drizzle ORM.
- **Sparse search:** Postgres `tsvector` with `portuguese` and `english` configurations.
- **Reranker:** `BAAI/bge-reranker-base` (multilingual, 278M params, ONNX) served via HF Text Embeddings Inference. v1 swapped from `bge-reranker-v2-m3` because the v2-m3 weights ship safetensors-only and candle's CPU runtime needs ~9 GB RSS, OOM'ing alongside bge-m3 in a typical WSL2/laptop setup. Wrapped behind a `Reranker` interface; a Cohere factory remains for portability, and bge-reranker-v2-m3 remains a one-line config swap once a GPU runtime is on the table.
- **PDF parsing (uploads):** `unpdf` for v1. Docling/LlamaParse flagged as v2.
- **Excel parsing (uploads):** `xlsx` (SheetJS) for v1.
- **Validation:** Zod schemas for request/response and tool input/output schemas.
- **Eval harness:** Custom runner over a JSON golden set; LLM-as-judge metrics.
- **Observability:** Structured logging of every tool call (input, output, latency) per request.

## 5. Architecture Overview

```
        ┌─────────────────────────┐
        │  Browser                │
        │  Next.js UI (useChat)   │
        │  - suggestion chips     │
        │  - tool-call stream     │
        │  - citation pills       │
        │  - drag-and-drop upload │
        └───────────┬─────────────┘
                    │ POST /api/chat (rewrites → api:3000)
                    ▼
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
                                                       │
                                                       ▼
                                           Next.js UI renders
                                           (markdown, tool steps,
                                            citation pills)
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
  embedding     VECTOR(1024),
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
6. Embed `contextual` text via BAAI/bge-m3 (1024 dims).
7. Insert `documents` (with `summary`) and `chunks` rows. Compute `tsv_pt` and `tsv_en`.
8. Sanity-check query at the end.

Re-running ingest: replace rows for documents whose content hash changed; leave others untouched.

## 14. Hybrid Retrieval

Used by the `search_convictions` tool, not directly by the agent loop.

1. Embed query.
2. Dense top 30 via pgvector cosine similarity.
3. Sparse top 30 via `ts_rank_cd` against the `language_hint`-matching tsvector (or both languages unioned if hint is `auto` or unmatched).
4. RRF fusion (`k=60`, equal weights). Output top 30.
5. bge-reranker-base → top 8 (or whatever the tool's `top_k` argument requested).

Tunable via `config.ts`.

## 15. File Uploads (Bonus)

`POST /chat` accepts either `application/json` (no uploads) or `multipart/form-data`
(with optional file attachments). The form fields are:

| Field | Type | Description |
|---|---|---|
| `messages` | string (JSON) | Same schema as the JSON body |
| `requestId` | string (optional) | Same as JSON body |
| `files` | File (repeatable) | PDF or Excel attachments |

**Per-request flow:**

1. API layer enforces a **25 MB hard limit per file** and rejects unsupported types
   with HTTP 415 before any parsing begins.
2. Files are parsed via a `FileParser` selected by `UPLOAD_PARSER` env var
   (`'anthropic'` default, `'local'` fallback):
   - **`LocalFileParser`** — `unpdf` for PDFs (page count tracked), SheetJS for Excel
     (each sheet → Markdown table, sheet count tracked). Runs in-process; no API calls.
   - **`AnthropicNativeFileParser`** — sends PDFs to Claude (`classifierModel`) as a
     `FilePart` document block and returns the model-extracted text. Excel always falls
     back to SheetJS. Throws `FileParseError('too_large')` when the PDF exceeds
     Anthropic's 32 MB / 100-page cap, triggering automatic retry with `LocalFileParser`.
3. Each parsed file is registered in an in-memory `UploadSession` with a UUID `file_id`.
   Content is flat (`string`); `ParsedContent` internals (including `pageCount` /
   `sheetCount`) are recorded to the trace but not exposed to the agent.
4. Parse latency, parser used, truncation status, and page/sheet counts are written to
   `trace.fileParses` before the agent loop starts.
5. The file listing is injected into the agent's system prompt:
   ```
   - file_id: "<uuid>"  filename: report.pdf  type: PDF document
   ```
   The `parse_upload` tool is registered only when uploads are present.
6. The agent decides whether and when to call `parse_upload(file_id)`.
7. Upload citations in `Sources:` use the prefix `uploaded/<filename>`. The validation
   layer allows them only when `parse_upload` was actually called for that file; uncalled
   uploads are stripped like any other hallucinated source.
8. After the request completes the session is garbage-collected. Files are never persisted.

**Truncation:** content exceeding ~50 K tokens (200 K chars) is cut with an inline note.
v2 will route large uploads to per-session ephemeral vector indexes.

**Out of scope for v1:** OCR for image-only PDFs, DOCX/CSV/plain-text, native OpenAI or
Gemini File API parsers, persistent file storage. All flagged as easy v2 additions.

**Key files:**

| File | Role |
|---|---|
| `uploads/parse.ts` | `UploadedFile`, `ParsedContent`, `FileParseError`, `FileParser` interface |
| `uploads/local.ts` | `LocalFileParser` — in-process PDF + Excel |
| `uploads/anthropic.ts` | `AnthropicNativeFileParser` — Anthropic FilePart + SheetJS fallback |
| `uploads/factory.ts` | `createFileParser(type, llm)` — parser selection + `too_large` fallback wrapper |
| `uploads/session.ts` | `createUploadSession()` — in-memory file registry |
| `tools/parseUpload.ts` | `parse_upload` tool — reads from session, surfaces `truncated` flag |
| `api/chat.ts` | Multipart handler, 25 MB limit, trace wiring |

## 16. UI Layer

The `ui/` directory is a Next.js 15 app (App Router, TypeScript, Tailwind) that provides the browser-facing chat interface.

### Streaming protocol

The API streams a Vercel AI SDK data-stream response from `POST /chat`. The UI consumes it via `useChat` from `@ai-sdk/react`, which reconstructs the message list (including interleaved tool-invocation parts) as chunks arrive over HTTP. No WebSockets; SSE-like chunked transfer.

### Key components

| File | Purpose |
|---|---|
| `app/page.tsx` | Root chat page — `useChat` wiring, submit logic, multipart fetch override |
| `components/ToolInvocation.tsx` | Live tool-call list during streaming; collapses to "How I answered this (N steps)" toggle when done |
| `components/MessageContent.tsx` | Lightweight inline markdown renderer — bold, italic, headings, bullet/ordered lists |
| `components/SourcePanel.tsx` | Side-drawer that fetches `/api/sources/:traceId` and shows retrieved chunks + scores |
| `components/AttachmentChip.tsx` | Pre-send file chip (with remove) and history chip (read-only) |
| `components/DropZone.tsx` | Wraps the chat area; accepts drag-and-drop files |

### Rewrite proxy

`next.config.js` proxies `/api/chat` → `http://api:3000/chat` and `/api/sources/:traceId` → `http://api:3000/sources/:traceId`. The browser only ever talks to the Next.js server; the Hono API is internal to the Docker network. The proxy destination is baked in at `next build` time via the `API_URL` Docker build-arg (defaults to `http://api:3000`; override locally with `API_URL=http://localhost:3000`).

### UX features

- **Suggestion chips** — three demo queries shown when the chat is empty. Click → `append()` directly (no form submit needed).
- **Pulsing loading placeholder** — three opacity-cycling dots while waiting for the first token.
- **Error banner with retry** — `useChat`'s `error` state surfaces a red banner; the Retry button calls `reload()`.
- **Markdown rendering** — bold, italic, headings, and bullet/numbered lists rendered as proper HTML; no external markdown library.
- **Fade-in animation** — each new message animates in with a 22 ms ease-out translate + opacity.

### Standalone Docker build

The Dockerfile in `ui/` uses `output: 'standalone'` in Next.js, which writes a self-contained server to `.next/standalone/`. The runtime stage copies that directory and runs `node server.js` — no `npm start`, no `next` binary needed in the image.

## 17. Observability

Every request gets a `trace` object that captures:

- Request ID, timestamp, user message, detected language.
- Each agent step: tool calls, tool inputs, tool outputs (truncated), latency.
- Final response, validation results, total tokens, total cost.

Logged as structured JSON. For v1, console + a JSONL file is sufficient. For v2, ship to Langfuse, Helicone, or similar.

This is non-optional. Agentic systems are debuggable only insofar as their traces are. A request with surprising output should be reproducible from its trace alone.

## 18. Evaluation

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

## 19. Forward-Looking Swap Points

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

## 20. Pragmatic Limitations to Flag in README

- Reranker and embeddings are self-hosted via HF Text Embeddings Inference (BAAI/bge-m3, BAAI/bge-reranker-v2-m3). No managed-API rate limits, but ops responsibility for the TEI containers; CPU inference is workable for v1's corpus (~600 chunks) but GPU is recommended at scale.
- Single-Postgres deployment doesn't scale past ~1M chunks → flag horizontal-scale path.
- Eval harness uses LLM-as-judge → flag the cost; propose RAGAS or ARES for v2.
- File uploads are in-memory only → flag the path to ephemeral per-session indexes.
- No conversation persistence → flag the path to a sessions table.
- Streaming UI is live in v1.1 (Next.js `useChat`, tool-call panel, citation pills, drag-and-drop).
- No prompt caching on the agent loop in v1. Anthropic caching on multi-turn agent calls is doable; flagged as an early optimization.

## 21. Out of Scope for v1

- Authentication, RBAC, multi-tenancy.
- Persistent conversation history across sessions.
- Fine-tuning of any kind.
- GraphRAG, ColPali, two-stage verification, Self-RAG — flagged in README as v2 candidates.
- Composite tools (`compare`, `summarize_corpus`). The agent composes from primitives.
- Streaming UI beyond the current implementation (streaming responses, session memory).

## 22. Build Order

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
