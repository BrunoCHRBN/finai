import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AsyncMutex,
  inferBrapiAssetType,
  fetchBrapiQuotes,
  searchBrapiAssets,
} from '../src/lib/market/brapi-adapter.ts';
import {
  fetchUsdtBrlRate,
  fetchBinance24hTickers,
  fetchCryptoDualQuotes,
  fetchBinanceKlines,
  searchPopularCryptoAssets,
} from '../src/lib/market/binance-adapter.ts';

describe('Sprint M2 — Resilient Market Adapters (brapi.dev & Binance Spot)', () => {
  describe('A. brapi.dev Adapter', () => {
    it('1. Serializes concurrent requests via AsyncMutex', async () => {
      const mutex = new AsyncMutex();
      const executionOrder: number[] = [];

      const makeTask = (id: number, delayMs: number) => async () => {
        const release = await mutex.acquire();
        executionOrder.push(id);
        await new Promise((r) => setTimeout(r, delayMs));
        release();
      };

      // Launch 3 tasks simultaneously
      await Promise.all([
        makeTask(1, 40)(),
        makeTask(2, 20)(),
        makeTask(3, 10)(),
      ]);

      // All 3 executed strictly in FIFO acquisition order
      assert.deepStrictEqual(executionOrder, [1, 2, 3]);
      assert.strictEqual(mutex.isLocked, false);
      assert.strictEqual(mutex.queueLength, 0);
    });

    it('2. Correctly infers B3 asset types from ticker format and hints', () => {
      assert.strictEqual(inferBrapiAssetType('PETR4', 'stock'), 'STOCK');
      assert.strictEqual(inferBrapiAssetType('VALE3'), 'STOCK');
      assert.strictEqual(inferBrapiAssetType('TAEE11', 'stock', 'unit'), 'STOCK');
      assert.strictEqual(inferBrapiAssetType('HGLG11', 'fund', 'fii'), 'FII');
      assert.strictEqual(inferBrapiAssetType('MXRF11'), 'FII');
      assert.strictEqual(inferBrapiAssetType('NVDC34', 'bdr'), 'BDR');
      assert.strictEqual(inferBrapiAssetType('AAPL34'), 'BDR');
      assert.strictEqual(inferBrapiAssetType('BOVA11', 'fund', 'etf'), 'ETF');
      assert.strictEqual(inferBrapiAssetType('SMAL11'), 'ETF');
      assert.strictEqual(inferBrapiAssetType('^BVSP'), 'INDEX');
      assert.strictEqual(inferBrapiAssetType('IFIX'), 'INDEX');
    });

    it('3. Normalizes brapi quote response with fundamental metrics and candles', async () => {
      const mockBrapiPayload = {
        results: [
          {
            symbol: 'PETR4',
            shortName: 'PETROBRAS PN',
            longName: 'Petróleo Brasileiro S.A.',
            regularMarketPrice: 36.50,
            regularMarketChange: 0.45,
            regularMarketChangePercent: 1.25,
            regularMarketDayHigh: 36.90,
            regularMarketDayLow: 36.10,
            regularMarketVolume: 45000000,
            marketCap: 475000000000,
            regularMarketTime: '2026-10-19T18:00:00.000Z',
            logourl: 'https://brapi.dev/petr4.png',
            dividendYield: 7.2,
            lastDividend: 0.52,
            priceEarnings: 4.8,
            priceToBook: 1.1,
            historicalDataPrice: [
              { date: 1729000000, open: 36.0, high: 36.8, low: 35.9, close: 36.5, volume: 1200000 },
            ],
            summaryProfile: { sector: 'Petróleo, Gás e Biocombustíveis' },
          },
          {
            symbol: 'HGLG11',
            shortName: 'CSHG LOGISTICA',
            longName: 'CSHG Logística FII',
            regularMarketPrice: 162.00,
            regularMarketChange: -0.80,
            regularMarketChangePercent: -0.49,
            regularMarketVolume: 12000,
            dividendYield: 8.5,
            lastDividend: 1.10,
            subType: 'fii',
          },
        ],
      };

      const customFetch: typeof fetch = async (input) => {
        const urlStr = String(input);
        const matchingResults = mockBrapiPayload.results.filter((r) =>
          urlStr.includes(encodeURIComponent(r.symbol)) || urlStr.includes(r.symbol)
        );
        return new Response(
          JSON.stringify({
            results: matchingResults.length > 0 ? matchingResults : mockBrapiPayload.results,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      };

      const result = await fetchBrapiQuotes(
        ['PETR4', 'HGLG11'],
        { range: '1mo', interval: '1d' },
        { fetchFn: customFetch, apiToken: 'test-token', baseUrl: 'https://brapi.dev/api' }
      );

      assert.strictEqual(result.quotes.length, 2);
      assert.strictEqual(result.assets.length, 2);

      const petr4Quote = result.quotes.find((q) => q.assetId === 'B3:PETR4')!;
      assert.strictEqual(petr4Quote.price, 36.5);
      assert.strictEqual(petr4Quote.change24hPct, 1.25);
      assert.strictEqual(petr4Quote.change24hAmount, 0.45);
      assert.strictEqual(petr4Quote.rawMetrics?.dividendYield, 7.2);
      assert.strictEqual(petr4Quote.rawMetrics?.lastDividend, 0.52);

      const petr4Asset = result.assets.find((a) => a.id === 'B3:PETR4')!;
      assert.strictEqual(petr4Asset.assetType, 'STOCK');
      assert.strictEqual(petr4Asset.sector, 'Petróleo, Gás e Biocombustíveis');

      const hglgAsset = result.assets.find((a) => a.id === 'B3:HGLG11')!;
      assert.strictEqual(hglgAsset.assetType, 'FII');

      const candles = result.historicalCandlesBySymbol['PETR4'];
      assert.strictEqual(candles.length, 1);
      assert.strictEqual(candles[0].close, 36.5);
    });

    it('4. Retries on HTTP 429 and succeeds on subsequent attempt', async () => {
      let callCount = 0;
      const customFetch: typeof fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('Rate limited', {
            status: 429,
            headers: { 'Retry-After': '0' },
          });
        }
        return new Response(JSON.stringify({ results: [{ symbol: 'PETR4', regularMarketPrice: 36.5 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const result = await fetchBrapiQuotes(
        ['PETR4'],
        {},
        { fetchFn: customFetch, maxRetries: 2, backoffBaseMs: 10 }
      );

      assert.strictEqual(callCount, 2);
      assert.strictEqual(result.quotes.length, 1);
      assert.strictEqual(result.quotes[0].price, 36.5);
    });

    it('5. Searches assets and parses indexes and stocks catalog', async () => {
      const mockListPayload = {
        indexes: [{ stock: '^BVSP', name: 'IBOVESPA' }],
        stocks: [
          { stock: 'VALE3', name: 'Vale S.A.', type: 'stock', sector: 'Mineração' },
          { stock: 'KNIP11', name: 'Kinea Rendimentos FII', type: 'fund', subType: 'fii' },
        ],
      };

      const customFetch: typeof fetch = async () => {
        return new Response(JSON.stringify(mockListPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const assets = await searchBrapiAssets(
        { search: 'VALE', limit: 10 },
        { fetchFn: customFetch }
      );

      assert.strictEqual(assets.length, 3);
      assert.strictEqual(assets.some((a) => a.symbol === '^BVSP' && a.assetType === 'INDEX'), true);
      assert.strictEqual(assets.some((a) => a.symbol === 'VALE3' && a.assetType === 'STOCK'), true);
      assert.strictEqual(assets.some((a) => a.symbol === 'KNIP11' && a.assetType === 'FII'), true);
    });
  });

  describe('B. Binance Spot Cryptocurrency Adapter', () => {
    it('1. Fetches real-time USDT/BRL rate', async () => {
      const customFetch: typeof fetch = async (input) => {
        const urlStr = String(input);
        assert.ok(urlStr.includes('/ticker/price?symbol=USDTBRL'));
        return new Response(JSON.stringify({ symbol: 'USDTBRL', price: '5.65400000' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const rate = await fetchUsdtBrlRate({ fetchFn: customFetch });
      assert.strictEqual(rate, 5.654);
    });

    it('2. Fetches 24hr tickers for single and multiple symbols', async () => {
      const customFetch: typeof fetch = async (input) => {
        const urlStr = String(input);
        if (urlStr.includes('symbol=BTCUSDT')) {
          return new Response(
            JSON.stringify({
              symbol: 'BTCUSDT',
              lastPrice: '68500.00',
              priceChangePercent: '2.50',
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify([
            { symbol: 'BTCUSDT', lastPrice: '68500.00' },
            { symbol: 'ETHUSDT', lastPrice: '3800.00' },
          ]),
          { status: 200 }
        );
      };

      const single = await fetchBinance24hTickers(['BTCUSDT'], { fetchFn: customFetch });
      assert.strictEqual(single.length, 1);
      assert.strictEqual(single[0].symbol, 'BTCUSDT');

      const multi = await fetchBinance24hTickers(['BTCUSDT', 'ETHUSDT'], { fetchFn: customFetch });
      assert.strictEqual(multi.length, 2);
    });

    it('3. Computes Dual Quotes (Primary USDT + BRL parity)', async () => {
      const customFetch: typeof fetch = async (input) => {
        const urlStr = String(input);
        if (urlStr.includes('/ticker/price?symbol=USDTBRL')) {
          return new Response(JSON.stringify({ symbol: 'USDTBRL', price: '5.60000000' }), { status: 200 });
        }
        if (urlStr.includes('/ticker/24hr')) {
          return new Response(
            JSON.stringify([
              {
                symbol: 'BTCUSDT',
                lastPrice: '68000.00',
                priceChange: '1500.00',
                priceChangePercent: '2.25',
                highPrice: '69000.00',
                lowPrice: '66500.00',
                quoteVolume: '1500000000.00',
                closeTime: 1729000000000,
              },
            ]),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected endpoint: ${urlStr}`);
      };

      const result = await fetchCryptoDualQuotes(['BTCUSDT'], { fetchFn: customFetch });

      assert.strictEqual(result.usdtBrlRate, 5.60);
      assert.strictEqual(result.quotes.length, 1);

      const btc = result.quotes[0];
      assert.strictEqual(btc.symbol, 'BTCUSDT');
      assert.strictEqual(btc.quoteAsset, 'USDT');
      assert.strictEqual(btc.priceUsdt, 68000);
      // 68,000 * 5.60 = 380,800.00
      assert.strictEqual(btc.priceBrl, 380800);
      // 1,500 * 5.60 = 8,400.00
      assert.strictEqual(btc.change24hAmountUsdt, 1500);
      assert.strictEqual(btc.change24hAmountBrl, 8400);
      assert.strictEqual(btc.change24hPct, 2.25);
      assert.strictEqual(btc.dayHighUsdt, 69000);
    });

    it('4. Converts Binance klines into canonical HistoricalCandle objects', async () => {
      const mockKlines = [
        [1729000000000, '67000.00', '68500.00', '66800.00', '68200.00', '1540.50'],
        [1729086400000, '68200.00', '69100.00', '67900.00', '68900.00', '1820.30'],
      ];

      const customFetch: typeof fetch = async () => {
        return new Response(JSON.stringify(mockKlines), { status: 200 });
      };

      const candles = await fetchBinanceKlines('BTCUSDT', '1d', 2, { fetchFn: customFetch });
      assert.strictEqual(candles.length, 2);
      assert.strictEqual(candles[0].open, 67000);
      assert.strictEqual(candles[0].high, 68500);
      assert.strictEqual(candles[0].close, 68200);
      assert.strictEqual(candles[1].close, 68900);
    });

    it('5. Filters popular crypto assets by query or symbol', () => {
      const all = searchPopularCryptoAssets();
      assert.ok(all.length >= 10);

      const btcOnly = searchPopularCryptoAssets('btc');
      assert.strictEqual(btcOnly.length, 1);
      assert.strictEqual(btcOnly[0].symbol, 'BTCUSDT');

      const solana = searchPopularCryptoAssets('Solana');
      assert.strictEqual(solana.length, 1);
      assert.strictEqual(solana[0].name, 'Solana');
    });
  });
});
