import { detectLanguage, type Language } from '../lib/language.js';
import type { Trace, ValidationResult } from '../observability/trace.js';

export type ValidateArgs = {
  trace: Trace;
  response: string;
  userMessage: string;
};

export type ValidateResult = {
  response: string;
  validation: ValidationResult;
};

const DISCLAIMER_MARK = '⚠️';
const DISCLAIMER_EN =
  "⚠️ This topic isn't covered by Decade's convictions. Answering from general knowledge.";
const DISCLAIMER_PT =
  '⚠️ Este tópico não está coberto pelas convicções da Decade. Respondendo com base em conhecimento geral.';

const SOURCES_LINE_RE = /^\*{0,2}Sources:\*{0,2}\s*(.+)$/m;
const TRIVIAL_OPENERS_RE =
  /^(oi|ol[aá]|hello|hi|hey|good\s+(morning|afternoon|evening)|bom\s+(dia|tarde|noite))\b/i;

/**
 * Per ARCHITECTURE.md §12: post-loop checks.
 *  1. Tool-use check — investment-y query but zero tool calls -> warn.
 *  2. Source attribution — strip cited document IDs not actually returned by
 *     a tool call in this run.
 *  3. Disclaimer — inject when an investment-y query went un-tooled and
 *     the response doesn't already disclaim.
 *  4. Language match — detect and warn (don't block) on mismatch.
 *
 * Pure local checks; no LLM calls. The corrective re-prompt and the
 * "all tools returned irrelevant" subtlety are deferred to v2 (both need
 * a judgment call we can't make without an LLM).
 */
export function validateAndFinalize(args: ValidateArgs): ValidateResult {
  const { trace, response: input, userMessage } = args;
  const warnings: string[] = [];

  const totalToolCalls = trace
    .getSteps()
    .reduce((acc, s) => acc + s.toolCalls.length, 0);
  const returnedDocIds = collectReturnedDocIds(trace);

  const sourcesCheck = cleanSourcesFooter(input, returnedDocIds);
  let response = sourcesCheck.cleanedResponse;
  if (sourcesCheck.strippedCount > 0) {
    warnings.push(
      `stripped ${sourcesCheck.strippedCount} hallucinated source id(s) from Sources footer`,
    );
  }

  const userLang = detectLanguage(userMessage);
  const trivial = isTrivialMessage(userMessage);
  const hadDisclaimer = response.includes(DISCLAIMER_MARK);

  let disclaimerOk = true;
  if (!trivial && totalToolCalls === 0 && !hadDisclaimer) {
    response = injectDisclaimer(response, userLang);
    disclaimerOk = false;
    warnings.push(
      'disclaimer was missing on a non-trivial query that skipped tool use; injected',
    );
  }

  const toolUseOk = trivial || totalToolCalls > 0 || hadDisclaimer;

  const responseLang = detectLanguage(response);
  const languageMatchOk =
    userLang === 'other' ||
    responseLang === 'other' ||
    responseLang === userLang;
  if (!languageMatchOk) {
    warnings.push(
      `language mismatch: user=${userLang} ("${userMessage.slice(0, 60)}..."), ` +
        `response=${responseLang}`,
    );
  }

  const validation: ValidationResult = {
    toolUseOk,
    sourceAttributionOk: sourcesCheck.strippedCount === 0,
    disclaimerOk,
    languageMatchOk,
    warnings,
  };

  return { response, validation };
}

/**
 * Walks every recorded tool call and collects the document IDs each tool
 * actually returned. Permissive across all three doc-touching tools:
 * search_convictions hits use `document_id`; read_document and
 * list_documents use `id`.
 */
function collectReturnedDocIds(trace: Trace): Set<string> {
  const ids = new Set<string>();
  for (const step of trace.getSteps()) {
    for (const call of step.toolCalls) {
      if (call.toolName === 'parse_upload') {
        // Upload citations use the "uploaded/<filename>" prefix (per system prompt).
        // Only allow them if the agent actually called parse_upload and got a result.
        const out = call.output;
        if (typeof out === 'object' && out !== null && typeof (out as Record<string, unknown>)['filename'] === 'string') {
          ids.add(`uploaded/${(out as Record<string, unknown>)['filename'] as string}`);
        }
      } else {
        collectFromValue(call.output, ids);
      }
    }
  }
  return ids;
}

function collectFromValue(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectFromValue(item, into);
    return;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj['document_id'] === 'string') into.add(obj['document_id']);
    if (typeof obj['id'] === 'string') into.add(obj['id']);
  }
}

type SourcesCheck = {
  cleanedResponse: string;
  strippedCount: number;
};

function cleanSourcesFooter(
  response: string,
  allowed: Set<string>,
): SourcesCheck {
  const match = SOURCES_LINE_RE.exec(response);
  if (!match) return { cleanedResponse: response, strippedCount: 0 };
  const list = match[1];
  if (list === undefined) return { cleanedResponse: response, strippedCount: 0 };

  const cited = list
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const kept = cited.filter((id) => allowed.has(id));
  const strippedCount = cited.length - kept.length;

  if (strippedCount === 0) {
    return { cleanedResponse: response, strippedCount: 0 };
  }
  if (kept.length === 0) {
    return {
      cleanedResponse: response.replace(SOURCES_LINE_RE, '').trimEnd(),
      strippedCount,
    };
  }
  const replacement = `Sources: ${kept.join(', ')}`;
  return {
    cleanedResponse: response.replace(SOURCES_LINE_RE, replacement),
    strippedCount,
  };
}

function injectDisclaimer(response: string, userLang: Language): string {
  const disclaimer = userLang === 'pt' ? DISCLAIMER_PT : DISCLAIMER_EN;
  return `${disclaimer}\n\n${response}`;
}

/**
 * v1 heuristic for "this looks like a greeting / off-topic chit-chat the
 * agent shouldn't tool-use for." Conservative: short messages and common
 * PT/EN greeting openers count as trivial. False negatives are tolerable
 * because the disclaimer would still be appropriate for non-trivial OOS
 * queries.
 */
function isTrivialMessage(msg: string): boolean {
  const trimmed = msg.trim();
  if (trimmed.length < 20) return true;
  if (TRIVIAL_OPENERS_RE.test(trimmed)) return true;
  return false;
}
