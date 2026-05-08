import {
  AGENT_SYSTEM_INTRO_AND_RULES,
  AGENT_SYSTEM_UPLOADS,
  AGENT_SYSTEM_VOICE,
} from '../prompts/agentSystem.js';

export type UploadFileInfo = {
  fileId: string;
  filename: string;
  mimeType: string;
  truncated: boolean;
};

export type SystemPromptArgs = {
  uploadedFiles?: UploadFileInfo[];
};

function describeFile(f: UploadFileInfo): string {
  const type =
    f.mimeType === 'application/pdf' || f.filename.toLowerCase().endsWith('.pdf')
      ? 'PDF document'
      : 'Excel spreadsheet';
  const note = f.truncated ? ' (truncated — content exceeds 50 K-token limit)' : '';
  return `- file_id: "${f.fileId}"  filename: ${f.filename}  type: ${type}${note}`;
}

/**
 * Builds the agent system prompt. The User Uploads section is included only
 * when the request carries uploads — keeps the agent from being primed to
 * use parse_upload when there's nothing to read.
 */
export function agentSystemPrompt(args: SystemPromptArgs): string {
  const sections = [AGENT_SYSTEM_INTRO_AND_RULES];
  if (args.uploadedFiles && args.uploadedFiles.length > 0) {
    const listing = args.uploadedFiles.map(describeFile).join('\n');
    sections.push(
      `${AGENT_SYSTEM_UPLOADS}\n\n# Uploaded Files (this turn only)\n\n${listing}`,
    );
  }
  sections.push(AGENT_SYSTEM_VOICE);
  return sections.join('\n\n');
}
