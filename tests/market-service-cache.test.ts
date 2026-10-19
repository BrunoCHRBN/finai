import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  getB3Quotes,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  clearMemoryCache,
  upsertMarketAssets,
} from '../src/lib/market/market-service.ts';
import { GET as getStocksQuoteRoute } from '../src/app/api/market/stocks/quote/route.ts';
import { GET as getWatchlistRoute, POST as postWatchlistRoute } from '../src/app/api/market/watchlist/route.ts';
import { DELETE as deleteWatchlistRoute } from '../src/app/api/market/watchlist/[id]/route.ts';
import { ensureDbInitialized, db } from '../src/db/index.ts';
import { marketWatchlist, marketQuotesCache, marketAssets } from '../src/db/schema.ts';

describe('Sprint M3 — Market Service Cache & API Endpoints', () => {
  beforeEach(async () => {
    clearMemoryCache();
    await ensureDbInitialized();
    // Clean test tables
    await db.delete(marketWatchlist);
    await db.delete(marketQuotesCache);
    await db.delete(marketAssets);
  });

  it('1. Caches B3 quotes in memory and avoids redundant external calls', async () => {
    let brapiCallCount = 0;
    const mockBrapiFetch: typeof fetch = async () => {
      brapiCallCount++;
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol: 'PETR4',
              regularMarketPrice: 38.5,
              regularMarketChangePercent: 2.1,
              regularMarketChange: 0.8,
            },
          ],
        }),
        { status: 200 }
      );
    };

    const config = { fetchFn: mockBrapiFetch, baseUrl: 'https://brapi.dev/api' };

    // 1st Call: Cache miss -> invokes brapi
    const res1 = await getB3Quotes(['PETR4'], { brapiConfig: config });
    assert.strictEqual(brapiCallCount, 1);
    assert.strictEqual(res1.quotes.length, 1);
    assert.strictEqual(res1.quotes[0].price, 38.5);
    assert.strictEqual(res1.quotes[0].isStale, false);

    // 2nd Call: In-memory cache hit -> does NOT invoke brapi
    const res2 = await getB3Quotes(['PETR4'], { brapiConfig: config });
    assert.strictEqual(brapiCallCount, 1, 'Second call should be served directly from memory cache');
    assert.strictEqual(res2.quotes[0].price, 38.5);

    // 3rd Call: Force refresh -> invokes brapi again
    const res3 = await getB3Quotes(['PETR4'], { forceRefresh: true, brapiConfig: config });
    assert.strictEqual(brapiCallCount, 2, 'Force refresh should bypass memory cache and query brapi');
    assert.strictEqual(res3.quotes[0].price, 38.5);
  });

  it('2. Falls back gracefully to stale database cache on provider outage', async () => {
    // 1. Pre-seed DB cache with an existing quote
    await upsertMarketAssets([
      {
        id: 'B3:VALE3',
        symbol: 'VALE3',
        name: 'Vale S.A.',
        assetType: 'STOCK',
        market: 'B3',
        currency: 'BRL',
        updatedAt: '2026-10-19T10:00:00Z',
      },
    ]);

    await db.insert(marketQuotesCache).values({
      id: 'B3:VALE3',
      assetId: 'B3:VALE3',
      price: 64.2,
      change24hPct: -1.5,
      change24hAmount: -0.98,
      quoteTimestamp: '2026-10-19T10:00:00Z',
      fetchedAt: '2026-10-19T10:00:00Z',
    });

    // 2. Mock failing brapi fetch (e.g. 503 or network failure)
    const failingBrapiFetch: typeof fetch = async () => {
      throw new Error('brapi service temporary outage');
    };

    const res = await getB3Quotes(['VALE3'], {
      forceRefresh: true,
      brapiConfig: { fetchFn: failingBrapiFetch, maxRetries: 0 },
    });

    assert.strictEqual(res.quotes.length, 1);
    assert.strictEqual(res.quotes[0].price, 64.2);
    assert.strictEqual(res.quotes[0].isStale, true, 'Fallback quote must carry isStale=true flag');
  });

  it('3. Manages user Watchlist items with asset and quote enrichment', async () => {
    // 1. Seed assets
    await upsertMarketAssets([
      {
        id: 'B3:ITUB4',
        symbol: 'ITUB4',
        name: 'Itaú Unibanco',
        assetType: 'STOCK',
        market: 'B3',
        currency: 'BRL',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'CRYPTO:BTCUSDT',
        symbol: 'BTCUSDT',
        name: 'Bitcoin',
        assetType: 'CRYPTO',
        market: 'CRYPTO',
        currency: 'USDT',
        updatedAt: new Date().toISOString(),
      },
    ]);

    // 2. Add items to watchlist
    await addToWatchlist({
      assetId: 'B3:ITUB4',
      targetPriceAlertHigh: 40.0,
      targetPriceAlertLow: 32.0,
      notes: 'Suporte importante em 32',
    });

    await addToWatchlist({
      assetId: 'CRYPTO:BTCUSDT',
      notes: 'Hold para longo prazo',
    });

    // 3. Retrieve enriched watchlist
    const watchlist = await getWatchlist();
    assert.strictEqual(watchlist.length, 2);

    const itubItem = watchlist.find((w) => w.assetId === 'B3:ITUB4');
    assert.ok(itubItem);
    assert.strictEqual(itubItem.asset?.name, 'Itaú Unibanco');
    assert.strictEqual(itubItem.targetPriceAlertHigh, 40.0);

    const btcItem = watchlist.find((w) => w.assetId === 'CRYPTO:BTCUSDT');
    assert.ok(btcItem);
    assert.strictEqual(btcItem.asset?.symbol, 'BTCUSDT');

    // 4. Remove item from watchlist
    const removed = await removeFromWatchlist('B3:ITUB4');
    assert.strictEqual(removed, true);

    const remaining = await getWatchlist();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].assetId, 'CRYPTO:BTCUSDT');
  });

  it('4. Handles route requests for stocks, crypto and watchlist', async () => {
    // Pre-seed an asset and quote
    await upsertMarketAssets([
      {
        id: 'B3:WEGE3',
        symbol: 'WEGE3',
        name: 'WEG S.A.',
        assetType: 'STOCK',
        market: 'B3',
        currency: 'BRL',
        updatedAt: new Date().toISOString(),
      },
    ]);

    await db.insert(marketQuotesCache).values({
      id: 'B3:WEGE3',
      assetId: 'B3:WEGE3',
      price: 52.8,
      change24hPct: 1.8,
      change24hAmount: 0.95,
      quoteTimestamp: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    });

    // 1. GET /api/market/stocks/quote
    const reqStocks = new NextRequest('http://localhost:3000/api/market/stocks/quote?symbols=WEGE3');
    const resStocks = await getStocksQuoteRoute(reqStocks);
    assert.strictEqual(resStocks.status, 200);
    const dataStocks = await resStocks.json();
    assert.strictEqual(dataStocks.quotes.length, 1);
    assert.strictEqual(dataStocks.quotes[0].price, 52.8);

    // 2. POST /api/market/watchlist
    const reqWatchlistPost = new NextRequest('http://localhost:3000/api/market/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: 'B3:WEGE3', notes: 'Top pick' }),
    });
    const resWatchlistPost = await postWatchlistRoute(reqWatchlistPost);
    assert.strictEqual(resWatchlistPost.status, 201);

    // 3. GET /api/market/watchlist
    const reqWatchlistGet = new NextRequest('http://localhost:3000/api/market/watchlist');
    const resWatchlistGet = await getWatchlistRoute(reqWatchlistGet);
    assert.strictEqual(resWatchlistGet.status, 200);
    const dataWatchlist = await resWatchlistGet.json();
    assert.strictEqual(dataWatchlist.count, 1);
    assert.strictEqual(dataWatchlist.items[0].assetId, 'B3:WEGE3');

    // 4. DELETE /api/market/watchlist/[id]
    const reqWatchlistDelete = new NextRequest('http://localhost:3000/api/market/watchlist/B3:WEGE3', {
      method: 'DELETE',
    });
    const resWatchlistDelete = await deleteWatchlistRoute(reqWatchlistDelete, {
      params: Promise.resolve({ id: 'B3:WEGE3' }),
    });
    assert.strictEqual(resWatchlistDelete.status, 200);

    const checkEmpty = await db.select().from(marketWatchlist);
    assert.strictEqual(checkEmpty.length, 0);
  });
});
