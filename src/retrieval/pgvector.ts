export type DenseHit = {
  chunkId: string;
  documentId: string;
  score: number;
};

export type DenseSearchArgs = {
  embedding: number[];
  topK: number;
};

export async function denseSearch(_args: DenseSearchArgs): Promise<DenseHit[]> {
  throw new Error('not implemented');
}
