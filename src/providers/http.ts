/**
 * Shared HTTP helper for self-hosted endpoints (TEI, etc.). Adds:
 *   - AbortController-based request timeout (default 60s).
 *   - Bounded retry with exponential backoff on 5xx responses and on
 *     network/abort errors. 4xx responses are returned to the caller and
 *     not retried — those are caller bugs, not transient faults.
 */

export type HttpFetchOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
};

export async function httpFetch(
  url: string,
  options: HttpFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 60_000,
    retries = 2,
    retryBaseDelayMs = 500,
    ...init
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status >= 500 && attempt < retries) {
        await sleep(retryBaseDelayMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(retryBaseDelayMs * 2 ** attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('httpFetch: retries exhausted');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
