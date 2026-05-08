import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { embeddings, llm } from '../config.js';
import { client, db } from '../db/index.js';
import { contextualizeChunk } from './contextualize.js';
import { embedBatch } from './embed.js';
import { indexDocument } from './index.js';
import { parseMarkdown } from './parse.js';
import { summarizeDocument } from './summarize.js';

const CONVICTIONS_DIR = resolve(process.cwd(), 'data/convictions');
const CONTEXTUALIZE_CONCURRENCY = 4;

async function main() {
  console.log(`→ reading ${CONVICTIONS_DIR}`);
  const files = (await readdir(CONVICTIONS_DIR)).filter((f) => f.endsWith('.md')).sort();
  if (files.length === 0) {
    console.log('no .md files found; nothing to do');
    return;
  }
  console.log(`→ found ${files.length} document(s)`);

  let inserted = 0;
  let replaced = 0;
  let skipped = 0;

  for (const file of files) {
    const path = join(CONVICTIONS_DIR, file);
    const markdown = await readFile(path, 'utf8');
    const doc = await parseMarkdown(file, markdown);
    process.stdout.write(`  ${doc.id} [${doc.language}, ${doc.chunks.length} chunks] `);

    const existingMatch = await isUnchanged(doc.id, markdown);
    if (existingMatch) {
      console.log('skipped (unchanged)');
      skipped++;
      continue;
    }

    const summary = await summarizeDocument({ llm, documentMarkdown: markdown });

    const contextualByChunkId = new Map<string, string>();
    await mapWithConcurrency(doc.chunks, CONTEXTUALIZE_CONCURRENCY, async (chunk) => {
      const contextual = await contextualizeChunk({
        llm,
        documentMarkdown: markdown,
        chunk,
      });
      contextualByChunkId.set(chunk.id, contextual);
    });

    const orderedChunkIds = doc.chunks.map((c) => c.id);
    const orderedTexts = orderedChunkIds.map((id) => contextualByChunkId.get(id)!);
    const vectors = await embedBatch({ embeddings, texts: orderedTexts });
    const embeddingByChunkId = new Map<string, number[]>();
    orderedChunkIds.forEach((id, i) => {
      const v = vectors[i];
      if (!v) throw new Error(`missing embedding for chunk ${id}`);
      embeddingByChunkId.set(id, v);
    });

    const result = await indexDocument({
      document: doc,
      summary,
      contextualByChunkId,
      embeddingByChunkId,
    });

    if (result.status === 'inserted') inserted++;
    else if (result.status === 'replaced') replaced++;
    else skipped++;
    console.log(result.status);
  }

  console.log(`\n→ done: ${inserted} inserted, ${replaced} replaced, ${skipped} skipped`);
  await sanityCheck();
  await client.end();
}

async function isUnchanged(id: string, contentMd: string): Promise<boolean> {
  const rows = await db.execute<{ content_md: string }>(
    sql`SELECT content_md FROM documents WHERE id = ${id} LIMIT 1`,
  );
  const row = rows[0];
  return row !== undefined && row.content_md === contentMd;
}

async function sanityCheck() {
  const docCount = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM documents`,
  );
  const chunkCount = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM chunks`,
  );
  console.log(
    `→ sanity: ${docCount[0]?.count ?? '?'} documents, ${chunkCount[0]?.count ?? '?'} chunks`,
  );

  const probe = 'CDB';
  const [vec] = await embeddings.embedMany([probe]);
  if (!vec) {
    console.log('→ sanity: skipped vector probe (no embedding)');
    return;
  }
  const lit = `[${vec.join(',')}]`;
  const top = await db.execute<{ document_id: string; chunk_index: number; sim: string }>(sql`
    SELECT document_id, chunk_index,
           (1 - (embedding <=> ${lit}::vector))::text AS sim
    FROM chunks
    ORDER BY embedding <=> ${lit}::vector
    LIMIT 3
  `);
  console.log(`→ sanity: nearest chunks for "${probe}":`);
  for (const r of top) {
    console.log(`    ${r.document_id} #${r.chunk_index}  sim=${r.sim}`);
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        const item = items[i];
        if (item === undefined) return;
        await fn(item);
      }
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
