import 'dotenv/config';
import { z } from 'zod';
import { anthropicLLM, type LLMProvider } from './providers/llm.js';
import {
  teiEmbeddings,
  type EmbeddingProvider,
} from './providers/embeddings.js';
import { teiReranker, type Reranker } from './providers/reranker.js';
import { createFileParser } from './uploads/factory.js';
import type { FileParser } from './uploads/parse.js';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  EMBEDDINGS_BASE_URL: z.string().url().default('http://localhost:8080'),
  RERANKER_BASE_URL: z.string().url().default('http://localhost:8081'),
  UPLOAD_PARSER: z.enum(['local', 'anthropic']).default('anthropic'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TRACE_FILE: z.string().default('./logs/traces.jsonl'),
});

const env = envSchema.parse(process.env);

export const config = {
  databaseUrl: env.DATABASE_URL,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  apiKeys: {
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
    google: env.GOOGLE_GENERATIVE_AI_API_KEY,
    cohere: env.COHERE_API_KEY,
  },
  endpoints: {
    embeddingsBaseUrl: env.EMBEDDINGS_BASE_URL,
    rerankerBaseUrl: env.RERANKER_BASE_URL,
  },
  observability: {
    traceFile: env.TRACE_FILE,
  },
  models: {
    agentModel: 'claude-sonnet-4-5',
    classifierModel: 'claude-haiku-4-5',
    embeddingModel: 'BAAI/bge-m3',
    embeddingDimensions: 1024,
    rerankerModel: 'BAAI/bge-reranker-base',
  },
  retrieval: {
    denseK: 30,
    sparseK: 30,
    fusionK: 60,
    rerankK: 8,
  },
  agent: {
    maxSteps: 10,
  },
  uploads: {
    parser: env.UPLOAD_PARSER,
  },
} as const;

export type AppConfig = typeof config;

/**
 * Per ARCHITECTURE.md §8 / §18: provider selection lives only here. Switching
 * the LLM, embedding, or reranker stack should be a one-line change in this
 * file, not a refactor of agent/api/tools code. Alternative factories
 * (openaiEmbeddings, cohereReranker, openaiLLM) remain in providers/ for
 * portability.
 */
export const llm: LLMProvider = anthropicLLM({
  agentModel: config.models.agentModel,
  classifierModel: config.models.classifierModel,
});

export const embeddings: EmbeddingProvider = teiEmbeddings({
  baseUrl: config.endpoints.embeddingsBaseUrl,
  modelId: config.models.embeddingModel,
  dimensions: config.models.embeddingDimensions,
});

export const reranker: Reranker = teiReranker({
  baseUrl: config.endpoints.rerankerBaseUrl,
  modelId: config.models.rerankerModel,
});

export const fileParser: FileParser = createFileParser(config.uploads.parser, llm);
