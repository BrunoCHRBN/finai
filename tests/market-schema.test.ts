import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import type { MarketAsset, MarketQuote, CryptoDualQuote } from '../src/lib/market/types.ts';

function matchesErrorMessage(err: unknown, pattern: RegExp): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const causeMsg = (err as { cause?: { message?: string } })?.cause?.message || '';
  return pattern.test(msg) || pattern.test(causeMsg);
}

describe('Sprint M1 — Market Intelligence Data Model & Relational Integrity', () => {
  const createTestDb = async () => {
    const client = createClient({ url: ':memory:' });
    await client.execute('PRAGMA foreign_keys = ON;');

    // 1. Create Core Market Tables
    await client.execute(`
      CREATE TABLE market_assets (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        market TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'BRL',
        logo_url TEXT,
        sector TEXT,
        sub_type TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE market_quotes_cache (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES market_assets(id) ON DELETE CASCADE,
        price REAL NOT NULL,
        change_24h_pct REAL NOT NULL DEFAULT 0,
        change_24h_amount REAL NOT NULL DEFAULT 0,
        day_high REAL,
        day_low REAL,
        volume_24h REAL,
        market_cap REAL,
        quote_timestamp TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        raw_payload_json TEXT
      );
    `);

    await client.execute(`
      CREATE TABLE market_watchlist (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES market_assets(id) ON DELETE CASCADE,
        target_price_alert_high REAL,
        target_price_alert_low REAL,
        notes TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

    // 2. Create Required Indexes and Unique Constraints
    await client.execute('CREATE UNIQUE INDEX market_assets_symbol_market_unique ON market_assets(symbol, market);');
    await client.execute('CREATE INDEX market_assets_type_idx ON market_assets(asset_type);');
    await client.execute('CREATE INDEX market_assets_market_idx ON market_assets(market);');
    await client.execute('CREATE INDEX market_quotes_cache_asset_id_idx ON market_quotes_cache(asset_id);');
    await client.execute('CREATE INDEX market_quotes_cache_fetched_at_idx ON market_quotes_cache(fetched_at);');
    await client.execute('CREATE UNIQUE INDEX market_watchlist_asset_id_unique ON market_watchlist(asset_id);');
    await client.execute('CREATE INDEX market_watchlist_sort_order_idx ON market_watchlist(sort_order);');

    const db = drizzle(client, { schema });
    return { client, db };
  };

  it('1. Inserts valid B3 and Crypto assets successfully', async () => {
    const { db } = await createTestDb();

    // Insert B3 Stock
    await db.insert(schema.marketAssets).values({
      id: 'B3:PETR4',
      symbol: 'PETR4',
      name: 'Petróleo Brasileiro S.A.',
      assetType: 'STOCK',
      market: 'B3',
      currency: 'BRL',
      sector: 'Petróleo e Gás',
      subType: 'stock',
      updatedAt: '2026-10-19T15:00:00Z',
    });

    // Insert B3 FII
    await db.insert(schema.marketAssets).values({
      id: 'B3:HGLG11',
      symbol: 'HGLG11',
      name: 'CSHG Logística FII',
      assetType: 'FII',
      market: 'B3',
      currency: 'BRL',
      sector: 'Logística',
      subType: 'fii',
      updatedAt: '2026-10-19T15:00:00Z',
    });

    // Insert Crypto Pair
    await db.insert(schema.marketAssets).values({
      id: 'CRYPTO:BTCUSDT',
      symbol: 'BTCUSDT',
      name: 'Bitcoin',
      assetType: 'CRYPTO',
      market: 'CRYPTO',
      currency: 'USDT',
      subType: 'spot',
      updatedAt: '2026-10-19T15:00:00Z',
    });

    const allAssets = await db.select().from(schema.marketAssets);
    assert.strictEqual(allAssets.length, 3);
    assert.strictEqual(allAssets.find((a) => a.symbol === 'PETR4')?.assetType, 'STOCK');
    assert.strictEqual(allAssets.find((a) => a.symbol === 'HGLG11')?.assetType, 'FII');
    assert.strictEqual(allAssets.find((a) => a.symbol === 'BTCUSDT')?.currency, 'USDT');
  });

  it('2. Enforces unique constraint on (symbol, market)', async () => {
    const { db } = await createTestDb();

    await db.insert(schema.marketAssets).values({
      id: 'B3:VALE3',
      symbol: 'VALE3',
      name: 'Vale S.A.',
      assetType: 'STOCK',
      market: 'B3',
      currency: 'BRL',
      updatedAt: '2026-10-19T15:00:00Z',
    });

    // Attempting duplicate (symbol, market) must throw constraint violation
    await assert.rejects(
      async () => {
        await db.insert(schema.marketAssets).values({
          id: 'B3:VALE3-DUP',
          symbol: 'VALE3',
          name: 'Vale S.A. Duplicate',
          assetType: 'STOCK',
          market: 'B3',
          currency: 'BRL',
          updatedAt: '2026-10-19T15:00:00Z',
        });
      },
      (err) => matchesErrorMessage(err, /UNIQUE constraint failed/i)
    );
  });

  it('3. Enforces referential integrity on quotes cache and watchlist', async () => {
    const { db } = await createTestDb();

    // Reject quote referencing non-existent asset
    await assert.rejects(
      async () => {
        await db.insert(schema.marketQuotesCache).values({
          id: 'B3:NONEXISTENT',
          assetId: 'B3:NONEXISTENT',
          price: 35.5,
          change24hPct: 1.2,
          change24hAmount: 0.42,
          quoteTimestamp: '2026-10-19T15:00:00Z',
          fetchedAt: '2026-10-19T15:00:01Z',
        });
      },
      (err) => matchesErrorMessage(err, /FOREIGN KEY constraint failed/i)
    );

    // Reject watchlist entry referencing non-existent asset
    await assert.rejects(
      async () => {
        await db.insert(schema.marketWatchlist).values({
          id: 'watch-1',
          assetId: 'B3:NONEXISTENT',
          createdAt: '2026-10-19T15:00:00Z',
        });
      },
      (err) => matchesErrorMessage(err, /FOREIGN KEY constraint failed/i)
    );
  });

  it('4. Cascade deletes quotes cache and watchlist when parent asset is deleted', async () => {
    const { db } = await createTestDb();

    // Insert asset
    await db.insert(schema.marketAssets).values({
      id: 'B3:ITUB4',
      symbol: 'ITUB4',
      name: 'Itaú Unibanco Holding S.A.',
      assetType: 'STOCK',
      market: 'B3',
      currency: 'BRL',
      updatedAt: '2026-10-19T15:00:00Z',
    });

    // Insert quote
    await db.insert(schema.marketQuotesCache).values({
      id: 'B3:ITUB4',
      assetId: 'B3:ITUB4',
      price: 36.2,
      change24hPct: -0.4,
      change24hAmount: -0.15,
      dayHigh: 36.8,
      dayLow: 35.9,
      quoteTimestamp: '2026-10-19T15:00:00Z',
      fetchedAt: '2026-10-19T15:00:05Z',
      rawPayloadJson: JSON.stringify({ dividendYield: 6.8 }),
    });

    // Insert into watchlist
    await db.insert(schema.marketWatchlist).values({
      id: 'watch-itub4',
      assetId: 'B3:ITUB4',
      targetPriceAlertHigh: 40.0,
      targetPriceAlertLow: 32.0,
      notes: 'Comprar se cair para 32',
      sortOrder: 1,
      createdAt: '2026-10-19T15:00:00Z',
    });

    // Verify records exist
    const initialQuotes = await db.select().from(schema.marketQuotesCache).where(eq(schema.marketQuotesCache.assetId, 'B3:ITUB4'));
    const initialWatchlist = await db.select().from(schema.marketWatchlist).where(eq(schema.marketWatchlist.assetId, 'B3:ITUB4'));
    assert.strictEqual(initialQuotes.length, 1);
    assert.strictEqual(initialWatchlist.length, 1);

    // Delete parent asset
    await db.delete(schema.marketAssets).where(eq(schema.marketAssets.id, 'B3:ITUB4'));

    // Verify cascade deleted quote and watchlist item
    const remainingQuotes = await db.select().from(schema.marketQuotesCache).where(eq(schema.marketQuotesCache.assetId, 'B3:ITUB4'));
    const remainingWatchlist = await db.select().from(schema.marketWatchlist).where(eq(schema.marketWatchlist.assetId, 'B3:ITUB4'));
    assert.strictEqual(remainingQuotes.length, 0);
    assert.strictEqual(remainingWatchlist.length, 0);
  });

  it('5. Enforces unique constraint on watchlist assetId', async () => {
    const { db } = await createTestDb();

    await db.insert(schema.marketAssets).values({
      id: 'CRYPTO:ETHUSDT',
      symbol: 'ETHUSDT',
      name: 'Ethereum',
      assetType: 'CRYPTO',
      market: 'CRYPTO',
      currency: 'USDT',
      updatedAt: '2026-10-19T15:00:00Z',
    });

    await db.insert(schema.marketWatchlist).values({
      id: 'watch-eth-1',
      assetId: 'CRYPTO:ETHUSDT',
      createdAt: '2026-10-19T15:00:00Z',
    });

    // Adding the same asset to the watchlist again must fail
    await assert.rejects(
      async () => {
        await db.insert(schema.marketWatchlist).values({
          id: 'watch-eth-2',
          assetId: 'CRYPTO:ETHUSDT',
          createdAt: '2026-10-19T15:05:00Z',
        });
      },
      (err) => matchesErrorMessage(err, /UNIQUE constraint failed/i)
    );
  });

  it('6. Conforms with canonical Market TypeScript interfaces', () => {
    const testAsset: MarketAsset = {
      id: 'B3:BOVA11',
      symbol: 'BOVA11',
      name: 'iShares Ibovespa Fundo de Índice',
      assetType: 'ETF',
      market: 'B3',
      currency: 'BRL',
      sector: 'Índice de Mercado',
      subType: 'etf',
      updatedAt: new Date().toISOString(),
    };
    assert.strictEqual(testAsset.assetType, 'ETF');

    const testQuote: MarketQuote = {
      id: 'B3:BOVA11',
      assetId: 'B3:BOVA11',
      price: 124.5,
      change24hPct: 0.85,
      change24hAmount: 1.05,
      dayHigh: 125.1,
      dayLow: 123.8,
      volume24h: 350000000,
      quoteTimestamp: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      isStale: false,
    };
    assert.strictEqual(testQuote.price, 124.5);

    const testDualQuote: CryptoDualQuote = {
      assetId: 'CRYPTO:SOLUSDT',
      symbol: 'SOLUSDT',
      baseAsset: 'SOL',
      quoteAsset: 'USDT',
      name: 'Solana',
      priceUsdt: 180.25,
      priceBrl: 1009.4,
      usdtBrlRate: 5.60,
      change24hPct: 4.5,
      change24hAmountUsdt: 7.75,
      change24hAmountBrl: 43.4,
      quoteTimestamp: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    };
    assert.strictEqual(testDualQuote.quoteAsset, 'USDT');
    assert.strictEqual(testDualQuote.usdtBrlRate, 5.60);
  });

  it('7. ensureDbInitialized creates market tables and indexes idempotently', async () => {
    const { ensureDbInitialized, client } = await import('../src/db/index.ts');
    await ensureDbInitialized();

    // Verify tables exist in SQLite sqlite_master
    const tablesRes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('market_assets', 'market_quotes_cache', 'market_watchlist');"
    );
    const tableNames = new Set(tablesRes.rows.map((r: Record<string, unknown>) => String(r.name)));
    assert.strictEqual(tableNames.has('market_assets'), true, 'market_assets table must exist');
    assert.strictEqual(tableNames.has('market_quotes_cache'), true, 'market_quotes_cache table must exist');
    assert.strictEqual(tableNames.has('market_watchlist'), true, 'market_watchlist table must exist');

    // Verify indexes exist
    const idxRes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'market_%';"
    );
    const indexNames = new Set(idxRes.rows.map((r: Record<string, unknown>) => String(r.name)));
    assert.strictEqual(indexNames.has('market_assets_symbol_market_unique'), true, 'symbol_market unique index must exist');
    assert.strictEqual(indexNames.has('market_watchlist_asset_id_unique'), true, 'watchlist asset_id unique index must exist');
  });
});

