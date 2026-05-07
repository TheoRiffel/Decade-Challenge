/**
 * The agent's behavioral contract. The full v1 template lives in
 * ARCHITECTURE.md §11 — drop it here verbatim when wiring up the agent
 * loop in step 6 of the build order.
 *
 * The §11 spec calls this "the most important artifact in the agentic
 * design" and explicitly notes it should be iterated on during eval.
 *
 * Build time vs runtime split:
 * - This module exports the static template (or template builder).
 * - agent/systemPrompt.ts conditions the runtime variant (e.g., includes
 *   the "User Uploads" section only when uploads are present).
 */
export const AGENT_SYSTEM_PROMPT_TEMPLATE = '';
