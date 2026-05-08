import { describe, expect, it } from 'vitest';
import { validateAndFinalize } from '../validate.js';
import type { AgentStepRecord, Trace, ValidationResult } from '../../observability/trace.js';

// Minimal Trace stub — only the parts validate.ts reads
function makeTrace(steps: AgentStepRecord[]): Trace {
  const recorded: ValidationResult[] = [];
  return {
    requestId: 'test-id',
    recordFileParse: () => undefined,
    recordStep: () => undefined,
    recordValidation: (r) => { recorded.push(r); },
    recordTokens: () => undefined,
    setDetectedLanguage: () => undefined,
    getSteps: () => steps,
    finish: () => { throw new Error('not needed in these tests'); },
  };
}

function makeParseUploadStep(filename: string): AgentStepRecord {
  return {
    stepIndex: 0,
    latencyMs: 10,
    toolCalls: [
      {
        toolName: 'parse_upload',
        input: { file_id: 'abc' },
        output: { filename, content: 'file content', truncated: false },
        latencyMs: 10,
      },
    ],
  };
}

function makeSearchStep(documentId: string): AgentStepRecord {
  return {
    stepIndex: 0,
    latencyMs: 10,
    toolCalls: [
      {
        toolName: 'search_convictions',
        input: { query: 'test' },
        output: [{ document_id: documentId, content: 'snippet' }],
        latencyMs: 10,
      },
    ],
  };
}

describe('validateAndFinalize — upload citations', () => {
  it('allows uploaded/<filename> when parse_upload was called for that file', () => {
    const response = 'Here is the analysis.\n\nSources: uploaded/portfolio.pdf';
    const trace = makeTrace([makeParseUploadStep('portfolio.pdf')]);
    const { response: out } = validateAndFinalize({ trace, response, userMessage: 'analyse my portfolio' });
    expect(out).toContain('Sources: uploaded/portfolio.pdf');
  });

  it('strips uploaded/<filename> when parse_upload was never called', () => {
    const response = 'Analysis based on upload.\n\nSources: uploaded/portfolio.pdf';
    const trace = makeTrace([]); // no tool calls
    const { response: out } = validateAndFinalize({ trace, response, userMessage: 'analyse my portfolio' });
    expect(out).not.toContain('Sources: uploaded/portfolio.pdf');
  });

  it('strips citation for a different file than the one actually parsed', () => {
    const response = 'Analysis.\n\nSources: uploaded/other.pdf';
    const trace = makeTrace([makeParseUploadStep('portfolio.pdf')]);
    const { response: out } = validateAndFinalize({ trace, response, userMessage: 'analyse my portfolio' });
    expect(out).not.toContain('uploaded/other.pdf');
  });

  it('allows mixed conviction + upload citations when both were retrieved', () => {
    const response = 'Analysis.\n\nSources: cdbs_quick_guide, uploaded/portfolio.pdf';
    const trace = makeTrace([
      makeSearchStep('cdbs_quick_guide'),
      makeParseUploadStep('portfolio.pdf'),
    ]);
    const { response: out } = validateAndFinalize({ trace, response, userMessage: 'compare my CDB with portfolio' });
    expect(out).toContain('Sources: cdbs_quick_guide, uploaded/portfolio.pdf');
  });

  it('strips only hallucinated conviction sources, keeps valid upload citation', () => {
    const response = 'Analysis.\n\nSources: hallucinated_doc, uploaded/report.xlsx';
    const trace = makeTrace([makeParseUploadStep('report.xlsx')]);
    const { response: out, validation } = validateAndFinalize({
      trace,
      response,
      userMessage: 'review this report',
    });
    expect(out).not.toContain('hallucinated_doc');
    expect(out).toContain('uploaded/report.xlsx');
    expect(validation.sourceAttributionOk).toBe(false);
  });
});
