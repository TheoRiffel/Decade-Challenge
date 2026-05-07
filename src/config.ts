import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
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
  models: {
    agentModel: 'claude-sonnet-4-5',
    classifierModel: 'claude-haiku-4-5',
    embeddingModel: 'text-embedding-3-large',
    rerankerModel: 'rerank-multilingual-v3.0',
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
} as const;

export type AppConfig = typeof config;
