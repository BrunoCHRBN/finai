import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, ensureDbInitialized } from '../src/db/index.ts';
import {
  marketAssets,
  marketQuotesCache,
  marketWatchlist,
  accounts,
  transactions,
  budgets,
  patrimonialAssets,
  patrimonialSnapshots,
} from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import {
  fetchBrapiQuotes,
  executeBrapiRequest,
  getBrapiConfig,
} from '../src/lib/market/brapi-adapter.ts';
import {
  fetchUsdtBrlRate,
  fetchBinance24hTickers,
  fetchCryptoDualQuotes,
  fetchBinanceKlines,
  getBinanceConfig,
} from '../src/lib/market/binance-adapter.ts';
import {
  getB3Quotes,
  getCryptoQuotes,
  getMarketOverview,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  upsertMarketAssets,
  clearMemoryCache,
} from '../src/lib/market/market-service.ts';

describe('Sprint M0.1 — Integridade das cotações, atualização real e correções de interação', () => {
  before(async () => {
    await ensureDbInitialized();
    clearMemoryCache();
  });

  after(async () => {
    clearMemoryCache();
  });

  // --------------------------------------------------------------------------
  // Test 1: Mapeamento de resposta sem cotação
  // --------------------------------------------------------------------------
  it('1. Mapeamento de resposta sem cotação: adaptador e serviço não inventam valores e preservam ausência sem converter em zero', async () => {
    const mockPayloadWithoutPrice = {
      results: [
        {
          symbol: 'XPTO3',
          shortName: 'XPTO Participações',
          regularMarketPrice: null, // explicitly null
          regularMarketChange: null,
          regularMarketChangePercent: null,
          regularMarketDayHigh: null,
          regularMarketDayLow: null,
          regularMarketVolume: null,
          regularMarketTime: null,
        },
      ],
    };

    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify(mockPayloadWithoutPrice), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const adapterResult = await fetchBrapiQuotes(['XPTO3'], undefined, {
      fetchFn: mockFetch,
      apiToken: 'test-token',
    });

    assert.strictEqual(adapterResult.quotes.length, 1);
    const q = adapterResult.quotes[0];
    assert.strictEqual(q.symbol, 'XPTO3');
    assert.strictEqual(q.price, null, 'Price must remain null, never 0');
    assert.strictEqual(q.change24hPct, null, 'Change percent must remain null, never 0.00%');
    assert.strictEqual(q.change24hAmount, null, 'Change amount must remain null');
    assert.strictEqual(q.dayHigh, null, 'dayHigh must be null');
    assert.strictEqual(q.dayLow, null, 'dayLow must be null');
    assert.strictEqual(q.volume24h, null, 'volume24h must be null');

    // Also verify at service level
    clearMemoryCache();
    const serviceResult = await getB3Quotes(['XPTO3'], {
      forceRefresh: true,
      brapiConfig: { fetchFn: mockFetch, apiToken: 'test-token' },
    });

    assert.strictEqual(serviceResult.quotes.length, 1);
    const sq = serviceResult.quotes[0];
    assert.strictEqual(sq.price, null, 'Service quote price must remain null');
    assert.strictEqual(sq.change24hPct, null, 'Service quote change24hPct must remain null');
  });

  // --------------------------------------------------------------------------
  // Test 2: USDT/BRL indisponível
  // --------------------------------------------------------------------------
  it('2. USDT/BRL indisponível: serviço de criptomoedas não assume 5,65 ou 5,60; paridade em BRL é omitida ou nula', async () => {
    // Custom mock where BTC ticker succeeds, but USDTBRL rate fails / throws
    const mockBinanceFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('USDTBRL')) {
        return new Response(JSON.stringify({ code: -1121, msg: 'Invalid symbol' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('ticker/24hr')) {
        return new Response(
          JSON.stringify([
            {
              symbol: 'BTCUSDT',
              lastPrice: '68500.00',
              priceChangePercent: '3.45',
              priceChange: '2280.00',
              highPrice: '69000.00',
              lowPrice: '66100.00',
              quoteVolume: '1500000000',
              closeTime: 1729350000000,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    };

    const result = await fetchCryptoDualQuotes(['BTCUSDT'], {
      fetchFn: mockBinanceFetch,
      maxRetries: 0,
    });

    assert.strictEqual(result.usdtBrlRate, null, 'Overall USDT/BRL rate must be null');
    assert.strictEqual(result.quotes.length, 1);

    const btcQuote = result.quotes[0];
    assert.strictEqual(btcQuote.priceUsdt, 68500);
    assert.strictEqual(btcQuote.usdtBrlRate, null, 'Quote USDT/BRL rate must be null');
    assert.strictEqual(btcQuote.priceBrl, null, 'BRL price must be null when rate is unavailable');
    assert.strictEqual(btcQuote.change24hAmountBrl, null, 'BRL change amount must be null');

    // Strict invariant: no artificial fallback numbers!
    assert.notStrictEqual(btcQuote.usdtBrlRate, 5.65, 'Must NEVER use fallback 5.65');
    assert.notStrictEqual(btcQuote.usdtBrlRate, 5.60, 'Must NEVER use fallback 5.60');
  });

  // --------------------------------------------------------------------------
  // Test 3: Semântica de timestamps
  // --------------------------------------------------------------------------
  it('3. Semântica de timestamps: diferenciação entre timestamp da cotação e timestamp da coleta; ausência preservada como nula', async () => {
    // 3A: Provider does NOT provide verified timestamp -> quoteTimestamp is null, fetchedAt is valid
    const mockPayloadNoTime = {
      results: [
        {
          symbol: 'PETR4',
          shortName: 'Petrobras',
          regularMarketPrice: 38.5,
          regularMarketTime: null, // missing verified timestamp
        },
      ],
    };

    const mockFetchNoTime: typeof fetch = async () =>
      new Response(JSON.stringify(mockPayloadNoTime), { status: 200 });

    const resNoTime = await fetchBrapiQuotes(['PETR4'], undefined, {
      fetchFn: mockFetchNoTime,
      apiToken: 'test-token',
    });

    const quoteNoTime = resNoTime.quotes[0];
    assert.strictEqual(quoteNoTime.quoteTimestamp, null, 'quoteTimestamp must be null when provider does not specify it');
    assert.ok(quoteNoTime.fetchedAt, 'fetchedAt must record the FinAI fetch timestamp');
    assert.doesNotThrow(() => new Date(quoteNoTime.fetchedAt).toISOString());

    // 3B: Provider provides verified timestamp -> preserved accurately
    const verifiedTime = '2026-10-19T14:30:00.000Z';
    const mockPayloadWithTime = {
      results: [
        {
          symbol: 'VALE3',
          shortName: 'Vale',
          regularMarketPrice: 62.0,
          regularMarketTime: verifiedTime,
        },
      ],
    };

    const mockFetchWithTime: typeof fetch = async () =>
      new Response(JSON.stringify(mockPayloadWithTime), { status: 200 });

    const resWithTime = await fetchBrapiQuotes(['VALE3'], undefined, {
      fetchFn: mockFetchWithTime,
      apiToken: 'test-token',
    });

    const quoteWithTime = resWithTime.quotes[0];
    assert.strictEqual(quoteWithTime.quoteTimestamp, verifiedTime, 'quoteTimestamp must preserve the verified provider time');
    assert.notStrictEqual(quoteWithTime.quoteTimestamp, quoteWithTime.fetchedAt, 'quoteTimestamp and fetchedAt must be distinct');
  });

  // --------------------------------------------------------------------------
  // Test 4: Sinalização de dado desatualizado (isStale: true)
  // --------------------------------------------------------------------------
  it('4. Sinalização de dado desatualizado: contingência informa claramente isStale: true', async () => {
    clearMemoryCache();

    // 1. Pre-seed DB cache with an asset and quote from 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await upsertMarketAssets([
      {
        id: 'B3:MGLU3',
        symbol: 'MGLU3',
        name: 'Magazine Luiza',
        assetType: 'STOCK',
        market: 'B3',
        currency: 'BRL',
        updatedAt: twoHoursAgo,
      },
    ]);

    await db
      .insert(marketQuotesCache)
      .values({
        id: 'B3:MGLU3',
        assetId: 'B3:MGLU3',
        price: 9.85,
        change24hPct: -2.4,
        change24hAmount: -0.24,
        quoteTimestamp: twoHoursAgo,
        fetchedAt: twoHoursAgo,
      })
      .onConflictDoUpdate({
        target: marketQuotesCache.id,
        set: {
          price: 9.85,
          change24hPct: -2.4,
          fetchedAt: twoHoursAgo,
        },
      });

    // 2. Mock network failure for brapi
    const mockFailingFetch: typeof fetch = async () => {
      throw new Error('brapi service temporary outage');
    };

    const res = await getB3Quotes(['MGLU3'], {
      forceRefresh: true,
      brapiConfig: { fetchFn: mockFailingFetch, maxRetries: 0 },
    });

    assert.strictEqual(res.quotes.length, 1);
    const staleQuote = res.quotes[0];
    assert.strictEqual(staleQuote.symbol, 'MGLU3');
    assert.strictEqual(staleQuote.price, 9.85);
    assert.strictEqual(staleQuote.isStale, true, 'Fallback quote from database must flag isStale: true');
    assert.strictEqual(staleQuote.source, 'cache', 'Source must reflect cache origin');
    assert.strictEqual(staleQuote.fetchedAt, twoHoursAgo);
  });

  // --------------------------------------------------------------------------
  // Test 5: Atualização forçada de ponta a ponta
  // --------------------------------------------------------------------------
  it('5. Atualização forçada: parâmetro forceRefresh invalida o cache e provoca nova consulta externa', async () => {
    clearMemoryCache();
    await db.delete(marketQuotesCache).where(eq(marketQuotesCache.id, 'B3:REFRESH_TEST'));
    let externalCallCount = 0;

    const mockFetchWithCounter: typeof fetch = async () => {
      externalCallCount++;
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol: 'REFRESH_TEST',
              shortName: 'Refresh Test Stock',
              regularMarketPrice: 35.0 + externalCallCount,
              regularMarketChangePercent: 1.0,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const config = { fetchFn: mockFetchWithCounter, apiToken: 'test-token' };

    // 1st Call: fresh fetch
    const res1 = await getB3Quotes(['REFRESH_TEST'], { brapiConfig: config });
    assert.strictEqual(externalCallCount, 1);
    assert.strictEqual(res1.quotes[0].price, 36.0);

    // 2nd Call without forceRefresh: hit memory cache, no external call
    const res2 = await getB3Quotes(['REFRESH_TEST'], { brapiConfig: config });
    assert.strictEqual(externalCallCount, 1, 'Memory cache hit must avoid external call');
    assert.strictEqual(res2.quotes[0].price, 36.0);

    // 3rd Call with forceRefresh = true: bypasses cache and calls external adapter
    const res3 = await getB3Quotes(['REFRESH_TEST'], { forceRefresh: true, brapiConfig: config });
    assert.strictEqual(externalCallCount, 2, 'Force refresh must invoke external fetch again');
    assert.strictEqual(res3.quotes[0].price, 37.0);
  });

  // --------------------------------------------------------------------------
  // Test 6: Compatibilidade da brapi (v1 e v2 / raiz vs aninhado em data)
  // --------------------------------------------------------------------------
  it('6. Compatibilidade da brapi: adapter lida com retornos onde o resultado está na raiz ou aninhado em chave data', async () => {
    // 6A: Root format (v1 / standard)
    const v1Payload = {
      results: [
        {
          symbol: 'B3SA3',
          shortName: 'B3',
          regularMarketPrice: 12.5,
          regularMarketChangePercent: 0.8,
          regularMarketTime: '2026-10-19T17:00:00Z',
        },
      ],
    };

    const resV1 = await fetchBrapiQuotes(['B3SA3'], undefined, {
      fetchFn: async () => new Response(JSON.stringify(v1Payload), { status: 200 }),
      apiToken: 'test-token',
    });
    assert.strictEqual(resV1.quotes.length, 1);
    assert.strictEqual(resV1.quotes[0].symbol, 'B3SA3');
    assert.strictEqual(resV1.quotes[0].price, 12.5);

    // 6B: Nested format (v2 / data wrapper)
    const v2Payload = {
      results: [
        {
          symbol: 'B3SA3',
          data: {
            symbol: 'B3SA3',
            shortName: 'B3 S.A. Brasil Bolsa Balcão',
            regularMarketPrice: 13.1,
            regularMarketChangePercent: -0.5,
            regularMarketTime: '2026-10-19T18:00:00Z',
          },
        },
      ],
    };

    const resV2 = await fetchBrapiQuotes(['B3SA3'], undefined, {
      fetchFn: async () => new Response(JSON.stringify(v2Payload), { status: 200 }),
      apiToken: 'test-token',
    });
    assert.strictEqual(resV2.quotes.length, 1);
    assert.strictEqual(resV2.quotes[0].symbol, 'B3SA3');
    assert.strictEqual(resV2.quotes[0].price, 13.1);
    assert.strictEqual(resV2.quotes[0].change24hPct, -0.5);
  });

  // --------------------------------------------------------------------------
  // Test 7: Sanitização de logs e mensagens de erro
  // --------------------------------------------------------------------------
  it('7. Sanitização de logs e erros: mensagens de erro da brapi não vazam o token contido na URL ou cabeçalho', async () => {
    const SECRET_TOKEN = 'mock-secret-brapi-key-xyz-987654';

    const mockLeakingFetch: typeof fetch = async (input) => {
      const url = String(input);
      // Simulate an upstream 500 server error returning the request URL with token in the body
      return new Response(`Error: Query failed on ${url}`, {
        status: 500,
        statusText: 'Internal Server Error',
      });
    };

    const config = getBrapiConfig({
      apiToken: SECRET_TOKEN,
      baseUrl: 'https://brapi.dev/api',
      maxRetries: 0,
      fetchFn: mockLeakingFetch,
    });

    let caughtError: Error | null = null;
    try {
      await executeBrapiRequest(
        `https://brapi.dev/api/quote/PETR4?token=${encodeURIComponent(SECRET_TOKEN)}`,
        config
      );
    } catch (err: unknown) {
      caughtError = err as Error;
    }

    assert.ok(caughtError, 'Should have thrown an error on 500 status');
    assert.strictEqual(
      caughtError.message.includes(SECRET_TOKEN),
      false,
      'Error message MUST NEVER contain the secret API token'
    );
    assert.ok(
      caughtError.message.includes('[REDACTED]'),
      'Error message must replace sensitive token with [REDACTED]'
    );
  });

  // --------------------------------------------------------------------------
  // Test 8: Granularidade de 1 ano em cripto
  // --------------------------------------------------------------------------
  it('8. Granularidade de 1 ano em cripto: gráfico anual utiliza velas diárias (interval=1d, limit=365) sem sobrecarregar horas', async () => {
    let requestedUrl = '';

    const mockKlinesFetch: typeof fetch = async (input) => {
      requestedUrl = String(input);
      // Return 365 sample daily klines
      const sampleKlines = Array.from({ length: 365 }, (_, idx) => [
        1700000000000 + idx * 86400000, // openTime
        '60000', // open
        '61000', // high
        '59500', // low
        '60500', // close
        '1000',  // volume
      ]);
      return new Response(JSON.stringify(sampleKlines), { status: 200 });
    };

    const candles = await fetchBinanceKlines('BTCUSDT', '1d', 365, {
      fetchFn: mockKlinesFetch,
    });

    assert.ok(requestedUrl.includes('interval=1d'), 'URL must specify interval=1d');
    assert.ok(requestedUrl.includes('limit=365'), 'URL must specify limit=365');
    assert.ok(!requestedUrl.includes('interval=1h'), 'Must not query 1-hour interval for 1-year view');
    assert.ok(!requestedUrl.includes('8760'), 'Must not attempt to fetch 8760 hourly candles');
    assert.strictEqual(candles.length, 365);
    assert.strictEqual(candles[0].close, 60500);
  });

  // --------------------------------------------------------------------------
  // Test 9: Invariância financeira
  // --------------------------------------------------------------------------
  it('9. Invariância financeira: execução do Market Intelligence não altera transações, contas ou snapshots patrimoniais', async () => {
    // 1. Snapshot financial core tables
    const accountsBefore = await db.select().from(accounts);
    const txsBefore = await db.select().from(transactions);
    const budgetsBefore = await db.select().from(budgets);
    const patrimonyBefore = await db.select().from(patrimonialAssets);
    const snapshotsBefore = await db.select().from(patrimonialSnapshots);

    // 2. Perform intensive Market Intelligence actions
    await getMarketOverview({ forceRefresh: true });
    await getB3Quotes(['PETR4', 'VALE3', 'ITUB4', 'BOVA11'], { forceRefresh: true });
    await getCryptoQuotes(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'], { forceRefresh: true });

    // Add and remove watchlist items
    await addToWatchlist({ assetId: 'B3:PETR4', targetPriceAlertLow: 30.0, notes: 'Acompanhar' });
    await addToWatchlist({ assetId: 'CRYPTO:BTCUSDT', targetPriceAlertHigh: 75000.0 });
    await getWatchlist({ forceRefresh: true });
    await removeFromWatchlist('B3:PETR4');
    await removeFromWatchlist('CRYPTO:BTCUSDT');

    // 3. Snapshot financial core tables after operations
    const accountsAfter = await db.select().from(accounts);
    const txsAfter = await db.select().from(transactions);
    const budgetsAfter = await db.select().from(budgets);
    const patrimonyAfter = await db.select().from(patrimonialAssets);
    const snapshotsAfter = await db.select().from(patrimonialSnapshots);

    assert.strictEqual(accountsAfter.length, accountsBefore.length, 'Accounts count must remain strictly unchanged');
    assert.strictEqual(txsAfter.length, txsBefore.length, 'Transactions count must remain strictly unchanged');
    assert.strictEqual(budgetsAfter.length, budgetsBefore.length, 'Budgets count must remain strictly unchanged');
    assert.strictEqual(patrimonyAfter.length, patrimonyBefore.length, 'Patrimonial assets count must remain strictly unchanged');
    assert.strictEqual(snapshotsAfter.length, snapshotsBefore.length, 'Patrimonial snapshots count must remain strictly unchanged');
  });
});
