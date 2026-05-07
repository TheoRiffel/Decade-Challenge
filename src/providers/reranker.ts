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
