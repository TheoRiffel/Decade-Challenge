import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import { httpFetch } from './http.js';

export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

export function openaiEmbeddings(opts: {
  modelId: string;
  dimensions: number;
}): EmbeddingProvider {
  const model = openai.embedding(opts.modelId, { dimensions: opts.dimensions });
  return {
    modelId: opts.modelId,
    dimensions: opts.dimensions,
    async embed(text) {
      const { embedding } = await embed({ model, value: text });
      return embedding;
    },
    async embedMany(texts) {
      const { embeddings } = await embedMany({ model, values: texts });
      return embeddings;
    },
  };
}

/**
 * Hugging Face Text Embeddings Inference (TEI) HTTP API. Works against
 * any TEI-compatible endpoint serving e.g. BAAI/bge-m3 (1024 dims).
 *
 *   docker run --rm -p 8080:80 \
 *     ghcr.io/huggingface/text-embeddings-inference:cpu-1.5 \
 *     --model-id BAAI/bge-m3
 */
export function teiEmbeddings(opts: {
  baseUrl: string;
  modelId: string;
  dimensions: number;
  batchSize?: number;
}): EmbeddingProvider {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const batchSize = opts.batchSize ?? 32;

  async function embedRaw(inputs: string[]): Promise<number[][]> {
    const res = await httpFetch(`${baseUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs, normalize: true, truncate: true }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TEI /embed failed (${res.status}): ${text}`);
    }
    return (await res.json()) as number[][];
  }

  return {
    modelId: opts.modelId,
    dimensions: opts.dimensions,
    async embed(text) {
      const [vec] = await embedRaw([text]);
      if (!vec) throw new Error('TEI /embed returned no vector');
      return vec;
    },
    async embedMany(texts) {
      if (texts.length === 0) return [];
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const vecs = await embedRaw(batch);
        out.push(...vecs);
      }
      return out;
    },
  };
}
