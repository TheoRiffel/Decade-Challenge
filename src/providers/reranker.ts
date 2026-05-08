import { httpFetch } from './http.js';

export type RerankResult = {
  index: number;
  score: number;
};

export interface Reranker {
  rerank(
    query: string,
    documents: string[],
    topK: number,
  ): Promise<RerankResult[]>;
}

type CohereRerankResponse = {
  results: Array<{ index: number; relevance_score: number }>;
};

/**
 * Cohere Rerank v2. Kept for portability per ARCHITECTURE.md §8/§18; not the
 * default since v1 favors a self-hosted reranker (see teiReranker).
 */
export function cohereReranker(opts: {
  apiKey: string | undefined;
  modelId: string;
  baseUrl?: string;
}): Reranker {
  const baseUrl = opts.baseUrl ?? 'https://api.cohere.com';
  return {
    async rerank(query, documents, topK) {
      if (!opts.apiKey) {
        throw new Error('COHERE_API_KEY is required to call the reranker');
      }
      const res = await httpFetch(`${baseUrl}/v2/rerank`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.modelId,
          query,
          documents,
          top_n: topK,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Cohere rerank failed (${res.status}): ${text}`);
      }
      const data = (await res.json()) as CohereRerankResponse;
      return data.results.map((r) => ({
        index: r.index,
        score: r.relevance_score,
      }));
    },
  };
}

type TeiRerankResponse = Array<{ index: number; score: number }>;

/**
 * Hugging Face Text Embeddings Inference (TEI) cross-encoder reranker.
 * Works against any TEI-compatible endpoint serving a reranker model
 * such as BAAI/bge-reranker-v2-m3.
 *
 *   docker run --rm -p 8081:80 \
 *     ghcr.io/huggingface/text-embeddings-inference:cpu-1.5 \
 *     --model-id BAAI/bge-reranker-v2-m3
 */
export function teiReranker(opts: {
  baseUrl: string;
  modelId: string;
}): Reranker {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  return {
    async rerank(query, documents, topK) {
      if (documents.length === 0 || topK <= 0) return [];
      const res = await httpFetch(`${baseUrl}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          texts: documents,
          truncate: true,
          raw_scores: false,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`TEI rerank failed (${res.status}): ${text}`);
      }
      const data = (await res.json()) as TeiRerankResponse;
      return data
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((r) => ({ index: r.index, score: r.score }));
    },
  };
}
