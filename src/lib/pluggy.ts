const PLUGGY_BASE_URL = process.env.PLUGGY_BASE_URL || 'https://api.pluggy.ai';
const PLUGGY_CLIENT_ID = process.env.PLUGGY_CLIENT_ID || '';
const PLUGGY_CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET || '';

interface PluggyApiKeyCache {
  apiKey: string;
  expiresAt: number;
}

let cachedApiKey: PluggyApiKeyCache | null = null;

/**
 * Authenticates with Pluggy and caches the JWT apiKey (valid for 2 hours)
 */
export async function getPluggyApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && cachedApiKey.expiresAt > now + 60 * 1000) {
    return cachedApiKey.apiKey;
  }

  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
    throw new Error('Pluggy credentials missing. Please check PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET.');
  }

  const response = await fetch(`${PLUGGY_BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Pluggy Auth failed (${response.status}): ${errorBody}`);
  }

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
export async function createPluggyConnectToken(itemId?: string): Promise<{ accessToken: string }> {
  const apiKey = await getPluggyApiKey();

  const response = await fetch(`${PLUGGY_BASE_URL}/connect_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify(itemId ? { itemId } : {}),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to generate Pluggy connect token: ${err}`);
  }

  return response.json();
}

/**
 * Fetches available Brazilian connectors (Nubank, Itaú, Bradesco, etc.)
 */
export async function getPluggyConnectors(country: string = 'BR') {
  const apiKey = await getPluggyApiKey();

  const response = await fetch(`${PLUGGY_BASE_URL}/connectors?countries=${country}`, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch connectors: ${err}`);
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Fetches accounts for a given connected item
 */
export async function getPluggyAccounts(itemId: string) {
  const apiKey = await getPluggyApiKey();

  const response = await fetch(`${PLUGGY_BASE_URL}/accounts?itemId=${itemId}`, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch accounts: ${err}`);
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Fetches transactions for an account or item within a date range
 */
export async function getPluggyTransactions(params: {
  accountId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const apiKey = await getPluggyApiKey();
  const url = new URL(`${PLUGGY_BASE_URL}/transactions`);

  if (params.accountId) url.searchParams.set('accountId', params.accountId);
  if (params.from) url.searchParams.set('from', params.from);
  if (params.to) url.searchParams.set('to', params.to);
  if (params.page) url.searchParams.set('page', params.page.toString());
  if (params.pageSize) url.searchParams.set('pageSize', params.pageSize.toString());

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch transactions: ${err}`);
  }

  const data = await response.json();
  return data.results || [];
}
