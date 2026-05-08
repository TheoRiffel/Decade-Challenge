import {
  AGENT_SYSTEM_INTRO_AND_RULES,
  AGENT_SYSTEM_UPLOADS,
  AGENT_SYSTEM_VOICE,
} from '../prompts/agentSystem.js';

export type SystemPromptArgs = {
  hasUploads: boolean;
};

/**
 * Builds the agent system prompt. The User Uploads section is included only
 * when the request carries uploads — keeps the agent from being primed to
 * use parse_upload when there's nothing to read.
 */
export function agentSystemPrompt(args: SystemPromptArgs): string {
  const sections = [AGENT_SYSTEM_INTRO_AND_RULES];
  if (args.hasUploads) sections.push(AGENT_SYSTEM_UPLOADS);
  sections.push(AGENT_SYSTEM_VOICE);
  return sections.join('\n\n');
}
