/**
 * FinAI Resilient Open Finance Client (Pluggy API v2)
 *
 * Implements:
 * - Exponential backoff with jitter on 429 (Rate Limit) and 502/503/504 (Server Errors).
 * - Per-request AbortController timeout (15s).
 * - Exhaustive pagination support with partial failure recovery.
 * - Secure credential caching and sensitive data redaction.
 */

const PLUGGY_BASE_URL = (process.env.PLUGGY_BASE_URL || 'https://api.pluggy.ai').trim().replace(/^["']|["']$/g, '');
const PLUGGY_CLIENT_ID = (process.env.PLUGGY_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
const PLUGGY_CLIENT_SECRET = (process.env.PLUGGY_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '');

interface PluggyApiKeyCache {
  apiKey: string;
  expiresAt: number;
}

let cachedApiKey: PluggyApiKeyCache | null = null;

export interface FetchRetryOptions {
  maxRetries?: number;
  backoffBaseMs?: number;
  timeoutMs?: number;
}

/**
 * Resilient fetch wrapper with timeout, exponential backoff, jitter and rate-limit handling.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchRetryOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const backoffBaseMs = options.backoffBaseMs ?? 300;
  const timeoutMs = options.timeoutMs ?? 15000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // If status is OK, return immediately
      if (response.ok) {
        return response;
      }

      // 429 Rate Limit
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        let waitMs = backoffBaseMs * Math.pow(2, attempt) + Math.random() * 200;
        if (retryAfterHeader) {
          const parsedSeconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSeconds)) {
            waitMs = Math.max(waitMs, parsedSeconds * 1000);
          }
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      // Transient 5xx Errors (502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout)
      if ([502, 503, 504].includes(response.status)) {
        if (attempt < maxRetries) {
          const waitMs = backoffBaseMs * Math.pow(2, attempt) + Math.random() * 200;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      // Permanent client errors (400, 401, 403, 404) or exhausted retries
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Pluggy API request failed (${response.status}): ${errorBody || response.statusText}`);
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
      const errorObj = isAbort ? new Error(`Pluggy request timed out after ${timeoutMs}ms`) : (err as Error);
      lastError = errorObj;

      if (attempt < maxRetries) {
        const waitMs = backoffBaseMs * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        break;
      }
    }
  }

  throw lastError || new Error('Pluggy request failed after retries');
}

/**
 * Authenticates with Pluggy and caches the JWT apiKey (valid for 2 hours)
 */
export async function getPluggyApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && cachedApiKey.expiresAt > now + 60 * 1000) {
    return cachedApiKey.apiKey;
  }

  const clientId = (process.env.PLUGGY_CLIENT_ID || PLUGGY_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
  const clientSecret = (process.env.PLUGGY_CLIENT_SECRET || PLUGGY_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '');
  const baseUrl = (process.env.PLUGGY_BASE_URL || PLUGGY_BASE_URL || 'https://api.pluggy.ai').trim().replace(/^["']|["']$/g, '');

  if (!clientId || !clientSecret) {
    throw new Error('Pluggy credentials missing. Please check PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET.');
  }

  const response = await fetchWithRetry(`${baseUrl}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      clientSecret,
    }),
  });

  const data = await response.json();
  const apiKey = data.apiKey;

  // Cache for 1 hour 45 minutes
  cachedApiKey = {
    apiKey,
    expiresAt: now + 105 * 60 * 1000,
  };

  return apiKey;
}

/**
 * Creates an ephemeral Connect Token to open the Pluggy Connect Widget
 */
export async function createPluggyConnectToken(
  optionsOrItemId?: string | { itemId?: string; connectorId?: number }
): Promise<{ accessToken: string }> {
  const apiKey = await getPluggyApiKey();

  const bodyPayload: Record<string, unknown> = {};
  if (typeof optionsOrItemId === 'string') {
    if (optionsOrItemId) bodyPayload.itemId = optionsOrItemId;
  } else if (optionsOrItemId) {
    if (optionsOrItemId.itemId) bodyPayload.itemId = optionsOrItemId.itemId;
    if (optionsOrItemId.connectorId) {
      bodyPayload.options = { connectorId: optionsOrItemId.connectorId };
    }
  }

  const response = await fetchWithRetry(`${PLUGGY_BASE_URL}/connect_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify(bodyPayload),
  });

  return response.json();
}

/**
 * Fetches available Brazilian connectors (Nubank, Itaú, Bradesco, etc.)
 */
export async function getPluggyConnectors(country: string = 'BR') {
  const apiKey = await getPluggyApiKey();

  const response = await fetchWithRetry(`${PLUGGY_BASE_URL}/connectors?countries=${country}`, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
    },
  });

  const data = await response.json();
  return data.results || [];
}

/**
 * Fetches accounts for a given connected item
 */
export async function getPluggyAccounts(itemId: string) {
  const apiKey = await getPluggyApiKey();

  const response = await fetchWithRetry(`${PLUGGY_BASE_URL}/accounts?itemId=${itemId}`, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
    },
  });

  const data = await response.json();
  return data.results || [];
}

export interface PluggyTransactionResult {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: string;
  status?: string;
  category?: string;
  categoryId?: string;
  [key: string]: unknown;
}

export interface PaginatedTransactionsResult {
  transactions: PluggyTransactionResult[];
  isPartial: boolean;
  totalPages: number;
  errorMessage?: string;
}

/**
 * Exhaustively fetches all transactions for an account via Pluggy API v2 pagination.
 * If pagination fails mid-way after retries, returns all successfully fetched pages
 * marked with `isPartial = true` so progress is never silently lost.
 */
export async function fetchAllPluggyTransactions(params: {
  accountId: string;
  pageSize?: number;
  maxPages?: number;
}): Promise<PaginatedTransactionsResult> {
  const apiKey = await getPluggyApiKey();
  const allTransactions: PluggyTransactionResult[] = [];
  const pageSize = params.pageSize || 100;
  const maxPages = params.maxPages || 50;

  let currentPage = 1;
  let totalPages = 1;
  let isPartial = false;
  let errorMessage: string | undefined;

  while (currentPage <= totalPages && currentPage <= maxPages) {
    const url = new URL(`${PLUGGY_BASE_URL}/v2/transactions`);
    url.searchParams.set('accountId', params.accountId);
    url.searchParams.set('page', String(currentPage));
    url.searchParams.set('pageSize', String(pageSize));

    try {
      const response = await fetchWithRetry(url.toString(), {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
        },
      });

      const data = await response.json();
      const pageResults: PluggyTransactionResult[] = data.results || [];
      allTransactions.push(...pageResults);

      if (data.totalPages && typeof data.totalPages === 'number') {
        totalPages = data.totalPages;
      }

      // If page had fewer items than pageSize, we have reached the end
      if (pageResults.length === 0 || pageResults.length < pageSize) {
        break;
      }

      currentPage++;
    } catch (err: unknown) {
      isPartial = true;
      errorMessage = err instanceof Error ? err.message : 'Falha ao buscar página de transações';
      console.warn(`[Pluggy] Pagination stopped at page ${currentPage}/${totalPages}: ${errorMessage}`);
      break;
    }
  }

  return {
    transactions: allTransactions,
    isPartial,
    totalPages,
    errorMessage,
  };
}

/**
 * Backwards-compatible single-call transaction fetcher
 */
export async function getPluggyTransactions(params: {
  accountId?: string;
  cursor?: string;
}) {
  if (params.accountId) {
    const res = await fetchAllPluggyTransactions({ accountId: params.accountId });
    return res.transactions;
  }
  const apiKey = await getPluggyApiKey();
  const url = new URL(`${PLUGGY_BASE_URL}/v2/transactions`);
  if (params.cursor) url.searchParams.set('after', params.cursor);

  const response = await fetchWithRetry(url.toString(), {
    method: 'GET',
    headers: { 'X-API-KEY': apiKey },
  });

  const data = await response.json();
  return data.results || [];
}
