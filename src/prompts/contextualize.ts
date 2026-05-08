/**
 * Anthropic Contextual Retrieval (https://www.anthropic.com/news/contextual-retrieval)
 * with a shared cacheable document-block prefix.
 *
 * The classifier model receives the full document once per cacheable block;
 * Anthropic prompt caching (cache_control: ephemeral) makes subsequent calls
 * with the same prefix ~90% cheaper. We deliberately use the same SYSTEM
 * prompt and the same `<document>...</document>` block format for both
 * summarizeDocument and contextualizeChunk so a single doc is cached once
 * across both passes.
 */

export const CACHED_SYSTEM = `You produce concise text used for document orientation and retrieval. Output only what is asked — no preamble, no quotes, no labels, no explanation of yourself.`;

export function documentBlock(documentMarkdown: string): string {
  return `<document>\n${documentMarkdown}\n</document>`;
}

export const SUMMARIZE_INSTRUCTION = `In 1–2 sentences, summarize the document above in the same language as the document. Focus on the topic and what kind of question this document would answer.`;

export function contextualizeInstruction(chunkContent: string): string {
  return `Here is the chunk we want to situate within the document above:\n<chunk>\n${chunkContent}\n</chunk>\n\nIn 1–2 sentences, write a short context that situates this chunk within the overall document, in the same language as the chunk. The context should help search retrieval find this chunk for relevant queries.`;
}
