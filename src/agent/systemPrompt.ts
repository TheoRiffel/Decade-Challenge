export type SystemPromptArgs = {
  hasUploads: boolean;
};

/**
 * Builds the agent system prompt. The base contract lives in
 * prompts/agentSystem.ts; this function selects/conditions sections at
 * runtime (e.g., the "User Uploads" block is included only when uploads
 * are present in the request).
 */
export function agentSystemPrompt(_args: SystemPromptArgs): string {
  throw new Error('not implemented');
}
