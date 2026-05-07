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

/**
 * Per ARCHITECTURE.md §12: post-loop checks on the final response.
 *
 * 1. Tool-use check — investment query but zero tool calls -> warn.
 * 2. Source attribution — strip cited document IDs that weren't actually
 *    returned by any tool call in this run.
 * 3. Disclaimer — inject the OOS disclaimer if no tools were called or all
 *    tool calls returned irrelevant results.
 * 4. Language match — detect and warn (don't block) on mismatch.
 *
 * Mostly local; the optional corrective re-prompt only fires on real
 * violations.
 */
export function validateAndFinalize(_args: ValidateArgs): ValidateResult {
  throw new Error('not implemented');
}
