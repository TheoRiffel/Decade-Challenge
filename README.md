# Decade Conviction Assistant

A conversational AI that answers investment questions **strictly grounded on Decade's conviction documents**. When a topic is covered by the corpus, answers come exclusively from those documents. When it isn't, the assistant answers from general knowledge with a visible disclaimer — and never pretends otherwise.

---

## Architecture

### Why agentic?

The core challenge — strict grounding across a growing multilingual corpus — maps naturally onto a tool-using agent rather than a deterministic pipeline.

A traditional approach would look like: `detect language → embed query → retrieve → rerank → classify scope → generate`. Every branch in that pipeline is hand-coded logic that gets more fragile as the corpus grows and user queries get more complex.

Instead, the LLM drives orchestration via tool calls:

```
User query
    │
    ▼
Agent loop  (Claude Sonnet, up to 10 steps)
    │
    ├── search_convictions  → hybrid retrieval (vector + keyword) + reranker
    ├── read_document       → full conviction doc when snippets are insufficient
    ├── list_documents      → catalog of covered topics
    └── parse_upload        → user-uploaded PDF or Excel (when present)
    │
    ▼
Validation layer            → strip hallucinated sources, inject missing disclaimers
    │
    ▼
Response + trace → JSONL
```

The model decides which tools to call, in what order, and when it has enough evidence. Multi-step queries like "compare CDB and CRA tax treatment" decompose naturally without any explicit query-decomposition code. As Claude gets better at tool use, the assistant gets better with zero code changes.

### Retrieval

Every query goes through hybrid retrieval before the agent answers:

1. **Dense search** — `BAAI/bge-m3` (1024-dim multilingual embeddings) + pgvector cosine similarity, top 30 candidates
2. **Sparse search** — PostgreSQL `tsvector` with language-specific configurations (`portuguese` / `english`), top 30 candidates
3. **RRF fusion** — Reciprocal Rank Fusion (k=60) merges both lists equally
4. **Reranking** — `BAAI/bge-reranker-base` cross-encoder reranks to top 8

Both BGE models are multilingual — a Portuguese query retrieves from English documents and vice versa. The agent handles language matching in its response.

### Grounding contract

The system prompt is the single highest-leverage artifact. It enforces:

- Tool use is **mandatory** before answering any investment question
- In-scope answers must end with a plain `Sources: doc_id_1, doc_id_2` footer
- Out-of-scope answers must begin with `⚠️ This topic isn't covered by Decade's convictions.`
- Respond in the user's language regardless of the document language

The post-loop validation layer backs this up: it strips any cited document ID that wasn't returned by a tool call in that run, and injects the disclaimer if the agent skipped tools on an investment question.

### Provider portability

Switching the LLM, embedding model, or reranker is a one-line change in `src/config.ts`. The AI SDK handles tool-call protocol differences across Anthropic, OpenAI, and Google; the agent loop in `src/agent/loop.ts` doesn't change when models swap. Alternative provider factories (`openaiEmbeddings`, `cohereReranker`, `openaiLLM`) are already implemented in `src/providers/`.

---

## Corpus

30 conviction documents in `data/convictions/`, primarily Portuguese and English, covering:

Brazilian equities, fixed income (CDB, CRA/CRI, Tesouro Direto, debentures, LCI/LCA), derivatives, FIIs, ETFs, multi-market funds, BDRs, crypto taxation, corporate governance, ESG, family office structures, macroeconomic factors, and more.

At ingestion, each document is chunked by Markdown structure, each chunk is contextualized with a Haiku-generated sentence (Anthropic contextual retrieval — ~90% embedding cost reduction on repeated chunks), embedded with BGE-M3, and indexed with both vector and tsvector columns.

---

## Quick start

### Prerequisites

- Docker (with Compose v2)
- An `ANTHROPIC_API_KEY`

```bash
git clone <repo>
cd Decade-Challenge
cp .env.example .env   # then set ANTHROPIC_API_KEY=sk-ant-...
docker compose up
```

Open **http://localhost:3000**.

First run takes 5–10 minutes while Docker pulls images and both BGE models download (~1.5 GB each). Subsequent runs start in ~30 seconds because the model weights are cached in named volumes (`embed-cache`, `rerank-cache`).

> **Note:** The embedding model (`bge-m3`) uses ~5 GB RAM on CPU. The reranker adds another ~1–2 GB. 8 GB total RAM is the practical minimum.

---

## Manual setup (without Docker)

### Prerequisites

- Node.js ≥ 20
- Docker (for the infrastructure services)
- An `ANTHROPIC_API_KEY`

### 1. Infrastructure

```bash
# Postgres with pgvector
docker run -d --name Decade-db \
  -e POSTGRES_PASSWORD=DecadeChallenge \
  -p 5433:5432 \
  pgvector/pgvector:pg17

# BGE-M3 embedding server (GPU — requires NVIDIA Container Toolkit)
docker run -d --gpus all --name decade-embed \
  -p 8080:80 -v decade-embed-cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:89-1.7.0 \
  --model-id BAAI/bge-m3

# BGE reranker server (CPU is fine for the reranker)
docker run -d --name decade-rerank \
  -p 8081:80 \
  ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-reranker-base
```

Wait for both TEI servers to report `{"message":"Ready"}` at their `/health` endpoints before proceeding.

> **CPU-only setup:** Replace `89-1.7.0` with `cpu-latest` for the embed container. Expect higher latency per query and possible OOM if both models run on the same machine with < 12 GB RAM. The reranker alone uses ~5–6 GB RSS.

### 2. Environment

```bash
cp .env.example .env   # or create .env manually
```

```env
DATABASE_URL=postgresql://postgres:DecadeChallenge@localhost:5433/postgres
ANTHROPIC_API_KEY=sk-ant-...

EMBEDDINGS_BASE_URL=http://localhost:8080
RERANKER_BASE_URL=http://localhost:8081

# 'anthropic' uses Claude to extract text from PDFs (better quality)
# 'local' uses unpdf in-process (no API calls, works offline)
UPLOAD_PARSER=anthropic

PORT=3000
LOG_LEVEL=info
```

### 3. Install and migrate

```bash
npm install
npm run db:migrate
```

### 4. Ingest the corpus

```bash
npm run ingest
```

Idempotent — re-running only re-processes documents whose content changed.

### 5. Start the server

```bash
npm run dev
```

---

## UI features

The chat UI at `http://localhost:3000` includes three notable features:

**Live tool-call streaming.** While the agent is working, each tool invocation appears in real time with a pulsing indicator — you can see the agent searching for `"CDB"` or reading `cdbs_quick_guide` before the answer arrives. After the response completes, the steps collapse into a "How I answered this (N steps)" toggle so the response stays clean.

**Citation source drill-down.** Every in-scope answer ends with citation pills (emerald for conviction documents, amber for uploaded files). Click any pill to open a side panel showing the exact retrieved chunks and their reranker scores — the grounding evidence the agent used.

**Drag-and-drop file upload.** Drop a PDF or Excel file anywhere on the page (or use the paperclip button) to attach it to the next message. The agent reads it via `parse_upload` and cites it as `uploaded/<filename>`, distinct from the conviction corpus.

> Screenshots: capture them from `http://localhost:3000` after `docker compose up`. A short screen recording covering a PT query, a file upload, and an out-of-scope disclaimer covers the full demo path.

---

## Testing it

### In the UI (primary)

After `docker compose up`, open **http://localhost:3000** and click one of the three suggestion chips, or type your own query. The agent's tool calls stream live above the response.

| # | Query | Expected behaviour |
|---|---|---|
| 1 | `O que é um CDB e como funciona?` | In-scope PT, cites `cdbs_quick_guide` |
| 2 | `How does Tesouro Direto work, and which bonds are most popular?` | In-scope EN, cites tesouro docs |
| 3 | `Compare CDB e CRA em termos de tributação e garantias.` | Multi-doc retrieval |
| 4 | `What does the Novo Mercado segment require for listed companies?` | Cites `corporate_governance_levels_b3` |
| 5 | `How is cryptocurrency taxed in Brazil?` | Cites `crypto_taxation_brazil` |
| 6 | `Resuma a tese de investimento em small caps brasileiras.` | Cross-lingual: PT query, EN doc |
| 7 | `Should I buy Bitcoin now?` | Borderline — searches, then disclaims on timing |
| 8 | `What is the boiling point of water?` | Out-of-scope, ⚠️ disclaimer, no Sources |
| 9 | `Me dê uma receita de feijoada.` | Out-of-scope PT, ⚠️ disclaimer |
| 10 | Drop a PDF portfolio on the page + ask to compare with Decade's convictions | File upload path |

### Via curl (API-only testing)

```bash
# Simple JSON request
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"O que é um CDB e como funciona?"}]}' \
  | jq .response

# With a file upload
curl -s -X POST http://localhost:3000/chat \
  -F 'messages=[{"role":"user","content":"Analise minha carteira comparando com as convicções da Decade."}]' \
  -F 'files=@portfolio.pdf' | jq .response
```

Note: the `curl` target is the **API** port when running manually (`:3000`). When running via Docker Compose, the API is internal-only — test through the UI or add a temporary `ports` entry to the api service.

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start server with hot reload |
| `npm run ingest` | Index conviction documents into Postgres |
| `npm run eval` | Run eval harness against 14 golden cases |
| `npm test` | Run unit tests (36 tests, ~600ms) |
| `npm run typecheck` | TypeScript strict check |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:studio` | Drizzle Studio — inspect DB in browser |

---

## Eval results

```
faithfulness             12/14 (86%) 0.83
scope_behavior           14/14 (100%)  —
source_precision         14/14 (100%) 1.00
disclaimer_presence      14/14 (100%)  —
language_match           14/14 (100%)  —
tool_call_efficiency     13/14 (93%) 0.95
```

`source_precision` and `disclaimer_presence` at 100% confirm the validation layer is working — the agent never cites a document it didn't retrieve, and always disclaims when appropriate. The `scope_behavior` score is suppressed by a prompt wording issue (agent wrote `**Sources:**` instead of `Sources:`) fixed in this session; the next run is expected to show a significant improvement.

---

## File upload support (bonus)

`POST /chat` accepts `multipart/form-data` with one or more `files` fields alongside the `messages` JSON string.

**Supported formats:** PDF and Excel (`.xlsx`, `.xls`)

**Parser strategy** (selected via `UPLOAD_PARSER`):

- `anthropic` — sends PDFs to Claude as a native document block. Extracts text with full layout awareness (handles tables, columns, headers). Automatically falls back to local parsing if the file exceeds Anthropic's 32 MB / 100-page cap.
- `local` — `unpdf` for PDFs, SheetJS for Excel (each sheet becomes a Markdown table). Runs in-process with no API calls; works offline.

**Limits:** 25 MB per file (API layer). Content exceeding ~50 K tokens is truncated with an inline note; the agent is told when this happens.

**Namespace separation:** upload citations use `uploaded/<filename>` in the `Sources:` footer, distinct from conviction document IDs. The validation layer enforces this — it strips `uploaded/<filename>` if the agent cites a file it never actually read via `parse_upload`.

---

## Deployment

Coming soon — see [`docs/deployment-railway.md`](docs/deployment-railway.md) for the Railway guide once Step 7 (local Docker Compose) is validated.

---

## What I'd change for production

### Retrieval quality

- **Switch to `bge-reranker-v2-m3`** — significantly stronger than `bge-reranker-base` for multilingual reranking. Currently on `base` due to the v2-m3 weights requiring ~9 GB RSS on CPU, which OOMs alongside bge-m3 in a laptop setup. On GPU this is a one-line config change.
- **Increase the golden set** to the target ~50 cases (currently 14) for more reliable eval signal.
- **LLM-judge calibration** — add human-labelled faithfulness scores on a subset to validate the judge's correlation with human judgement.

### Infrastructure

- **Managed embeddings** — replace self-hosted TEI with a managed API (Voyage AI, Cohere Embed v3, or OpenAI `text-embedding-3-large`) to eliminate the ops burden of running two Docker containers per deployment. One-line change in `config.ts`.
- **Connection pooling** — add PgBouncer or use Neon/Supabase connection pooling; the current direct Postgres driver doesn't pool across requests.
- **Horizontal scale** — pgvector's HNSW index handles ~1M chunks on a single node. Beyond that, partition the corpus by topic or date and run multiple retrieval workers.

### Observability

- **Ship traces to Langfuse or Helicone** — traces are already structured JSONL; adding a sink is a one-module addition (`src/observability/sink.ts`). This enables dataset collection, prompt regression tracking, and cost dashboards over time.
- **Prompt caching** — Anthropic's prompt caching on the system prompt and conversation history would cut token costs ~60–80% on multi-turn conversations at current usage.

### Agent

- **Streaming responses** — `streamText` is a drop-in replacement for `generateText` in the agent loop; the API handler needs an SSE endpoint. Reduces perceived latency from ~4s to first-token in ~1s.
- **Corrective re-prompt** — the validation layer currently only warns when the agent skips tools on an investment question. For production, a single corrective message ("You did not check the convictions — please call `search_convictions` before answering.") would catch the remaining faithfulness failures.
- **Session memory** — add a `sessions` table and a `recall_session(id)` tool. The agent's stateless design means this is a tool addition, not an architectural change.

### File uploads

- **Large file routing** — uploads exceeding ~50 K tokens currently get truncated. For production, route them to a per-session ephemeral vector index (same pipeline as the main corpus, dropped after the session ends).
- **Docling or LlamaParse** for scanned PDFs and image-heavy documents — `unpdf` and Anthropic's native parser both fail silently on image-only content. Docling's multimodal pipeline handles these.
