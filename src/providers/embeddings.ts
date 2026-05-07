export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}
