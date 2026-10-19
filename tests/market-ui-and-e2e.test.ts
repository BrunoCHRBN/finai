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
} from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import {
  getMarketOverview,
  getB3Quotes,
  getCryptoQuotes,
  searchB3,
  searchCrypto,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlist,
  clearMemoryCache,
} from '../src/lib/market/market-service.ts';
import { GET as getOverviewRoute } from '../src/app/api/market/overview/route.ts';
import { GET as getCryptoSearchRoute } from '../src/app/api/market/crypto/search/route.ts';
import { GET as getCryptoQuoteRoute } from '../src/app/api/market/crypto/quote/route.ts';
import { GET as getStockSearchRoute } from '../src/app/api/market/stocks/search/route.ts';
import { GET as getStockQuoteRoute } from '../src/app/api/market/stocks/quote/route.ts';
import {
  GET as getWatchlistRoute,
  POST as postWatchlistRoute,
} from '../src/app/api/market/watchlist/route.ts';
import {
  DELETE as deleteWatchlistRoute,
  PATCH as patchWatchlistRoute,
} from '../src/app/api/market/watchlist/[id]/route.ts';
import { NextRequest } from 'next/server';

function createMockNextRequest(url: string, options?: { method?: string; body?: any }) {
  const init: RequestInit = {
    method: options?.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (options?.body) {
    init.body = JSON.stringify(options.body);
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init as any);
}

describe('Sprint M6 — Market Intelligence End-to-End & Integrity Suite', () => {
  before(async () => {
    await ensureDbInitialized();
    clearMemoryCache();
    // Cleanup any test watchlist rows
    await db.delete(marketWatchlist);
  });

  after(async () => {
    await db.delete(marketWatchlist);
    clearMemoryCache();
  });

  it('1. Overview Route returns unified B3 indices, Crypto highlights, and USDT/BRL rate', async () => {
    const req = createMockNextRequest('http://localhost:3000/api/market/overview');
    const res = await getOverviewRoute(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.indices), 'indices should be an array');
    assert.ok(Array.isArray(body.cryptoHighlights), 'cryptoHighlights should be an array');
    assert.ok(typeof body.usdtBrlRate === 'number', 'usdtBrlRate should be a positive number');
    assert.ok(body.usdtBrlRate > 0, 'usdtBrlRate must be greater than zero');
    assert.ok(body.updatedAt, 'updatedAt must be defined');

    // Confirm presence of key crypto highlights
    const btcHighlight = body.cryptoHighlights.find((c: any) => c.symbol === 'BTCUSDT');
    assert.ok(btcHighlight, 'Bitcoin USDT should be present in crypto highlights');
    assert.ok(btcHighlight.priceUsdt > 0, 'BTC priceUsdt should be > 0');
    assert.ok(btcHighlight.priceBrl > 0, 'BTC priceBrl should be > 0');
  });

  it('2. Crypto Search & Dual Quote Routes function correctly', async () => {
    // A. Search Route
    const searchReq = createMockNextRequest('http://localhost:3000/api/market/crypto/search?q=SOL');
    const searchRes = await getCryptoSearchRoute(searchReq);
    assert.equal(searchRes.status, 200);
    const searchBody = await searchRes.json();
    assert.ok(Array.isArray(searchBody.assets));
    const sol = searchBody.assets.find((a: any) => a.symbol === 'SOLUSDT');
    assert.ok(sol, 'SOLUSDT should be found');
    assert.equal(sol.currency, 'USDT');
    assert.equal(sol.market, 'CRYPTO');

    // B. Quote Route with candles
    const quoteReq = createMockNextRequest(
      'http://localhost:3000/api/market/crypto/quote?symbol=SOLUSDT&candles=true&limit=5'
    );
    const quoteRes = await getCryptoQuoteRoute(quoteReq);
    assert.equal(quoteRes.status, 200);
    const quoteBody = await quoteRes.json();
    assert.ok(Array.isArray(quoteBody.quotes));
    const solQuote = quoteBody.quotes.find((q: any) => q.symbol === 'SOLUSDT');
    assert.ok(solQuote, 'SOLUSDT quote should be returned');
    assert.ok(solQuote.priceUsdt > 0, 'priceUsdt must be positive');
    assert.ok(solQuote.priceBrl > 0, 'priceBrl must be positive');
    assert.ok(quoteBody.candlesBySymbol, 'candlesBySymbol must be present');
  });

  it('3. Stock Search & Quote Routes function correctly', async () => {
    // A. Search Route
    const searchReq = createMockNextRequest('http://localhost:3000/api/market/stocks/search?q=PETR');
    const searchRes = await getStockSearchRoute(searchReq);
    assert.equal(searchRes.status, 200);
    const searchBody = await searchRes.json();
    assert.ok(Array.isArray(searchBody.assets));

    // B. Quote Route
    const quoteReq = createMockNextRequest('http://localhost:3000/api/market/stocks/quote?symbols=PETR4');
    const quoteRes = await getStockQuoteRoute(quoteReq);
    assert.equal(quoteRes.status, 200);
    const quoteBody = await quoteRes.json();
    assert.ok(Array.isArray(quoteBody.quotes));
    assert.ok(quoteBody.quotes.length > 0);
    const petr = quoteBody.quotes[0];
    assert.ok(petr.price > 0, 'PETR4 price should be positive');
  });

  it('4. Full Watchlist Lifecycle (POST -> GET -> PATCH -> DELETE)', async () => {
    // 1. POST add B3 asset
    const postReq = createMockNextRequest('http://localhost:3000/api/market/watchlist', {
      method: 'POST',
      body: {
        assetId: 'B3:VALE3',
        targetPriceAlertLow: 55.0,
        targetPriceAlertHigh: 75.0,
        notes: 'Comprar se recuar abaixo de 55',
      },
    });
    const postRes = await postWatchlistRoute(postReq);
    assert.equal(postRes.status, 201);

    // 2. POST add Crypto asset
    const postCryptoReq = createMockNextRequest('http://localhost:3000/api/market/watchlist', {
      method: 'POST',
      body: {
        assetId: 'CRYPTO:BTCUSDT',
        targetPriceAlertLow: 60000.0,
        targetPriceAlertHigh: 80000.0,
        notes: 'DCA semanal',
      },
    });
    const postCryptoRes = await postWatchlistRoute(postCryptoReq);
    assert.equal(postCryptoRes.status, 201);

    // 3. GET watchlist enriched items
    const getReq = createMockNextRequest('http://localhost:3000/api/market/watchlist');
    const getRes = await getWatchlistRoute(getReq);
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.count, 2);

    const b3Item = getBody.items.find((i: any) => i.assetId === 'B3:VALE3');
    assert.ok(b3Item, 'VALE3 should be in watchlist');
    assert.equal(b3Item.targetPriceAlertLow, 55.0);
    assert.equal(b3Item.targetPriceAlertHigh, 75.0);
    assert.ok(b3Item.latestQuote, 'VALE3 must have latestQuote populated');

    const cryptoItem = getBody.items.find((i: any) => i.assetId === 'CRYPTO:BTCUSDT');
    assert.ok(cryptoItem, 'BTCUSDT should be in watchlist');
    assert.ok(cryptoItem.cryptoDualQuote, 'BTCUSDT must have cryptoDualQuote populated');
    assert.ok(cryptoItem.cryptoDualQuote.priceUsdt > 0);
    assert.ok(cryptoItem.cryptoDualQuote.priceBrl > 0);

    // 4. PATCH update alert levels
    const patchReq = createMockNextRequest(`http://localhost:3000/api/market/watchlist/${b3Item.id}`, {
      method: 'PATCH',
      body: {
        targetPriceAlertLow: 52.0,
        notes: 'Meta revisada para 52',
      },
    });
    const patchRes = await patchWatchlistRoute(patchReq, {
      params: Promise.resolve({ id: b3Item.id }),
    });
    assert.equal(patchRes.status, 200);

    // Verify patch in DB
    const [updatedRow] = await db
      .select()
      .from(marketWatchlist)
      .where(eq(marketWatchlist.id, b3Item.id));
    assert.equal(updatedRow.targetPriceAlertLow, 52.0);
    assert.equal(updatedRow.notes, 'Meta revisada para 52');

    // 5. DELETE remove items
    const delReq1 = createMockNextRequest(`http://localhost:3000/api/market/watchlist/${b3Item.id}`, {
      method: 'DELETE',
    });
    const delRes1 = await deleteWatchlistRoute(delReq1, {
      params: Promise.resolve({ id: b3Item.id }),
    });
    assert.equal(delRes1.status, 200);

    const delReq2 = createMockNextRequest(`http://localhost:3000/api/market/watchlist/${cryptoItem.id}`, {
      method: 'DELETE',
    });
    const delRes2 = await deleteWatchlistRoute(delReq2, {
      params: Promise.resolve({ id: cryptoItem.id }),
    });
    assert.equal(delRes2.status, 200);

    const finalGetRes = await getWatchlistRoute(getReq);
    const finalBody = await finalGetRes.json();
    assert.equal(finalBody.count, 0);
  });

  it('5. Financial Invariant: Market Intelligence has ZERO side effects on bank accounts, transactions or patrimony', async () => {
    // Snapshot state of financial core tables
    const accountsBefore = await db.select().from(accounts);
    const txsBefore = await db.select().from(transactions);
    const budgetsBefore = await db.select().from(budgets);
    const patrimonyBefore = await db.select().from(patrimonialAssets);

    // Perform intensive market operations: quotes, overview, watchlist additions
    await getMarketOverview();
    await getB3Quotes(['PETR4', 'VALE3', 'HGLG11', 'BOVA11']);
    await getCryptoQuotes(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    await addToWatchlist({ assetId: 'B3:PETR4', targetPriceAlertLow: 30.0 });
    await addToWatchlist({ assetId: 'CRYPTO:ETHUSDT', targetPriceAlertHigh: 4000.0 });
    await getWatchlist();
    await removeFromWatchlist('B3:PETR4');
    await removeFromWatchlist('CRYPTO:ETHUSDT');

    // Snapshot state of financial core tables after operations
    const accountsAfter = await db.select().from(accounts);
    const txsAfter = await db.select().from(transactions);
    const budgetsAfter = await db.select().from(budgets);
    const patrimonyAfter = await db.select().from(patrimonialAssets);

    assert.equal(
      accountsAfter.length,
      accountsBefore.length,
      'Accounts count must remain strictly unchanged'
    );
    assert.equal(
      txsAfter.length,
      txsBefore.length,
      'Transactions count must remain strictly unchanged'
    );
    assert.equal(
      budgetsAfter.length,
      budgetsBefore.length,
      'Budgets count must remain strictly unchanged'
    );
    assert.equal(
      patrimonyAfter.length,
      patrimonyBefore.length,
      'Patrimonial assets must remain strictly unchanged'
    );

    // Verify account balances are untouched
    for (let i = 0; i < accountsBefore.length; i++) {
      assert.equal(accountsAfter[i].balance, accountsBefore[i].balance);
    }
  });
});
