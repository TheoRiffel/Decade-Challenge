/**
 * Per ARCHITECTURE.md §13 step 5: contextualize each chunk with a 1–2
 * sentence context, prepended to the chunk before embedding. Run by Haiku
 * with Anthropic prompt caching on the parent document (caches across all
 * chunks of the same doc, ~90% cost reduction).
 */
export const CONTEXTUALIZE_PROMPT_TEMPLATE = '';
