#!/usr/bin/env node
/**
 * FinAI — Sprint 6, Fase 5: benchmark reproduzivel do Copiloto.
 *
 * Uso:
 *   node --import ./tests/alias-register.mjs scripts/benchmark-copilot.mjs
 *   (ou `pnpm run benchmark`)
 *   Flags: --iterations=30  --warmup=5  --json
 *
 * IMPORTANTE — as tres camadas de latencia NAO sao intercambiaveis:
 *   A. INTERNA      : snapshot + roteamento + resposta deterministica. Zero rede.
 *   B. SIMULADA     : com um provedor falso de latencia fixa. Zero rede real.
 *   C. REAL         : API Gemini. So roda com GEMINI_API_KEY valida; caso
 *                     contrario e reportada como PENDENTE (nunca estimada).
 *
 * Nenhum dado pessoal: as fixtures sao sinteticas e declaradas neste arquivo.
 */
import { performance } from 'node:perf_hooks';
import os from 'node:os';

const {
  calculateFinancialMetrics,
} = await import('../src/lib/ai/math-engine.ts');
const { calculatePatrimonialSummary } = await import('../src/lib/patrimony-engine.ts');
const {
  prepareCanonicalTransactions,
  calculateBudgetExecution,
  evaluateFinancialGoals,
  calculateCashFlowProjection,
} = await import('../src/lib/planning-engine.ts');
const {
  buildUnifiedConsultativeSnapshot,
  invalidateConsultativeSnapshotCache,
  getCachedConsultativeSnapshot,
  setCachedConsultativeSnapshot,
} = await import('../src/lib/ai/snapshot-compressor.ts');
const {
  routeFinancialQuery,
  buildDeterministicCopilotResponse,
  executeCopilotAnalysis,
  getGeminiRuntimeConfig,
  clearAIMetrics,
  getAIObservabilityMetrics,
} = await import('../src/lib/ai/gemini-client.ts');

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const ITERATIONS = arg('iterations', 30);
const WARMUP = arg('warmup', 5);
const AS_JSON = process.argv.includes('--json');

// ---------------------------------------------------------------------------
// Fixtures sinteticas
// ---------------------------------------------------------------------------
const ACCOUNTS = [
  { id: 'acc-chk', name: 'Conta Corrente', type: 'CHECKING', balance: 12500 },
  { id: 'acc-sav', name: 'Reserva', type: 'SAVINGS', balance: 30000 },
  { id: 'acc-inv', name: 'Investimentos', type: 'INVESTMENT', balance: 45000 },
  { id: 'acc-card', name: 'Cartao', type: 'CREDIT_CARD', balance: 3200 },
];

const CATEGORIES = [
  { id: 'c-moradia', name: 'Moradia', group: 'FIXED', budgetLimit: 3500 },
  { id: 'c-mercado', name: 'Mercado', group: 'VARIABLE', budgetLimit: 1800 },
  { id: 'c-lazer', name: 'Lazer', group: 'VARIABLE', budgetLimit: 900 },
  { id: 'c-aporte', name: 'Aportes', group: 'INVESTMENT', budgetLimit: 2000 },
];

const TRANSACTIONS = [
  { id: 't1', accountId: 'acc-chk', categoryId: 'c-moradia', description: 'Salario', amount: 14000, date: '2026-10-05', type: 'CREDIT', isIgnored: 0 },
  { id: 't2', accountId: 'acc-chk', categoryId: 'c-moradia', description: 'Aluguel', amount: -3500, date: '2026-10-06', type: 'DEBIT', isIgnored: 0 },
  { id: 't3', accountId: 'acc-card', categoryId: 'c-mercado', description: 'Supermercado Extra', amount: -1250.9, date: '2026-10-08', type: 'DEBIT', isIgnored: 0 },
  { id: 't4', accountId: 'acc-card', categoryId: 'c-lazer', description: 'Restaurante', amount: -320.45, date: '2026-10-11', type: 'DEBIT', isIgnored: 0 },
  { id: 't5', accountId: 'acc-chk', categoryId: 'c-aporte', description: 'Aporte Tesouro', amount: -2000, date: '2026-10-12', type: 'DEBIT', isIgnored: 0 },
  { id: 't6', accountId: 'acc-chk', description: 'Pix para Reserva', amount: -1500, date: '2026-10-13', type: 'TRANSFER', isIgnored: 0 },
  { id: 't7', accountId: 'acc-sav', description: 'Pix para Reserva', amount: 1500, date: '2026-10-13', type: 'TRANSFER', isIgnored: 0 },
  { id: 't8', accountId: 'acc-chk', categoryId: 'c-lazer', description: 'Cinema', amount: -85, date: '2026-10-14', type: 'DEBIT', isIgnored: 1 },
  { id: 't9', accountId: 'acc-card', categoryId: 'c-mercado', description: 'Estorno Mercado', amount: 120, date: '2026-10-15', type: 'CREDIT', isIgnored: 0 },
];

const GOALS = [
  { id: 'g1', title: 'Reserva de emergencia', targetAmount: 60000, currentAmount: 30000, plannedMonthlyContribution: 1500, status: 'ACTIVE', priority: 1 },
];

const BUDGETS = [
  { id: 'b1', month: '2026-10', categoryId: 'c-moradia', plannedAmount: 3500, status: 'ACTIVE' },
  { id: 'b2', month: '2026-10', categoryId: 'c-mercado', plannedAmount: 1800, status: 'ACTIVE' },
];

const PERIOD = '2026-10';

/** Cenario de pergunta -> prompt + operacao. */
const SCENARIOS = [
  { id: 'deterministic-single-metric', prompt: 'Quanto gastei neste mes?', operation: 'CHAT', expectRoute: 'DIRECT' },
  { id: 'everyday-budget-question', prompt: 'Quais categorias estouraram o orcamento?', operation: 'CHAT', expectRoute: 'FAST' },
  { id: 'full-diagnosis', prompt: 'Faca um diagnostico completo da minha situacao financeira', operation: 'DIAGNOSE', expectRoute: 'ADVANCED' },
  { id: 'cash-flow-projection', prompt: 'Como fica meu fluxo de caixa nos proximos 6 meses?', operation: 'CHAT', expectRoute: 'ADVANCED' },
  { id: 'patrimonial-analysis', prompt: 'Analise meu patrimonio liquido e meus passivos', operation: 'DIAGNOSE', expectRoute: 'ADVANCED' },
  { id: 'insufficient-data', prompt: 'Qual a previsao do dolar para dezembro?', operation: 'CHAT', expectRoute: 'FAST' },
  { id: 'ambiguous-question', prompt: 'Vale a pena?', operation: 'CHAT', expectRoute: 'FAST' },
  { id: 'fallback-unavailable', prompt: 'Quais categorias estouraram o orcamento?', operation: 'CHAT', expectRoute: 'FAST', forceProviderFailure: true },
];

const MOCK_PROVIDER_LATENCY_MS = 25;

// ---------------------------------------------------------------------------
// Montagem do snapshot (dados sinteticos -> motores deterministicos)
// ---------------------------------------------------------------------------
function buildSnapshot() {
  const canonical = prepareCanonicalTransactions(TRANSACTIONS, ACCOUNTS);
  const withCats = canonical.map((t) => {
    const cat = CATEGORIES.find((c) => c.id === t.categoryId);
    return { ...t, categoryName: cat?.name, categoryGroup: cat?.group };
  });
  const metrics = calculateFinancialMetrics(withCats, ACCOUNTS);
  const patrimonySummary = calculatePatrimonialSummary(ACCOUNTS, [], []);
  const budgetSummary = calculateBudgetExecution(PERIOD, CATEGORIES, BUDGETS, canonical);
  const goalsSummary = evaluateFinancialGoals(GOALS, ACCOUNTS, PERIOD);
  const cashFlowProjection = calculateCashFlowProjection({
    referenceMonth: PERIOD,
    horizonMonths: 6,
    accounts: ACCOUNTS,
    reconciledTransactions: canonical,
    recurringFlows: [],
    liabilities: [],
    goals: GOALS,
  });
  return buildUnifiedConsultativeSnapshot({
    period: PERIOD,
    metrics,
    patrimonySummary,
    budgetSummary,
    goalsSummary,
    cashFlowProjection,
    alerts: [],
  });
}

// ---------------------------------------------------------------------------
// Estatistica
// ---------------------------------------------------------------------------
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    mean: sorted.length ? sum / sorted.length : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

const round = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Camada A — INTERNA (zero rede)
// ---------------------------------------------------------------------------
async function runInternalLayer() {
  const perScenario = [];
  for (const sc of SCENARIOS) {
    const snapshotSamples = [];
    const routeSamples = [];
    const deterministicSamples = [];
    const totalSamples = [];

    for (let i = 0; i < WARMUP + ITERATIONS; i++) {
      const t0 = performance.now();
      const snapshot = buildSnapshot();
      const t1 = performance.now();
      const decision = routeFinancialQuery({ prompt: sc.prompt, operation: sc.operation });
      const t2 = performance.now();
      buildDeterministicCopilotResponse({
        snapshot,
        operation: sc.operation,
        userPrompt: sc.prompt,
        routeDecision: decision,
        fallbackType: 'NONE',
        latencyMs: 0,
        retries: 0,
      });
      const t3 = performance.now();

      if (i >= WARMUP) {
        snapshotSamples.push(t1 - t0);
        routeSamples.push(t2 - t1);
        deterministicSamples.push(t3 - t2);
        totalSamples.push(t3 - t0);
      }
    }

    const decision = routeFinancialQuery({ prompt: sc.prompt, operation: sc.operation });
    perScenario.push({
      id: sc.id,
      route: decision.route,
      routeMatchesExpectation: decision.route === sc.expectRoute,
      snapshot: summarize(snapshotSamples),
      routeMs: summarize(routeSamples),
      deterministic: summarize(deterministicSamples),
      total: summarize(totalSamples),
    });
  }
  return perScenario;
}

// ---------------------------------------------------------------------------
// Camada B — SIMULADA (provedor falso com latencia fixa; zero rede real)
// ---------------------------------------------------------------------------
async function runSimulatedLayer() {
  const perScenario = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const validContract = JSON.stringify({
    summary: 'Resposta sintetica de benchmark.',
    answer: 'Resposta sintetica de benchmark.',
    statusFinanceiro: 'SAUDAVEL',
    observations: [],
    recommendations: [],
    limitations: [],
    followUpSuggestions: [],
    ProjecaoAnual: 'Estavel.',
  });

  for (const sc of SCENARIOS) {
    const totalSamples = [];
    let providerCalls = 0;

    for (let i = 0; i < WARMUP + ITERATIONS; i++) {
      clearAIMetrics();
      const snapshot = buildSnapshot();
      const t0 = performance.now();
      const res = await executeCopilotAnalysis({
        snapshot,
        operation: sc.operation,
        userPrompt: sc.prompt,
        envOverrides: { GEMINI_API_KEY: 'AIzaSimulatedKeyNeverUsedOnNetwork1' },
        sleepFn: async () => {},
        customGenerateContent: async () => {
          providerCalls++;
          if (sc.forceProviderFailure) {
            const err = new Error('503 Service Unavailable');
            err.status = 503;
            throw err;
          }
          await sleep(MOCK_PROVIDER_LATENCY_MS);
          return { text: validContract, inputTokens: 420, outputTokens: 180 };
        },
      });
      const t1 = performance.now();
      if (i >= WARMUP) totalSamples.push(t1 - t0);
      if (i === WARMUP + ITERATIONS - 1) {
        sc._last = { fallbackType: res.meta.fallbackType, modelUsed: res.meta.modelUsed };
      }
    }

    perScenario.push({
      id: sc.id,
      total: summarize(totalSamples),
      providerCallsPerIteration: providerCalls / (WARMUP + ITERATIONS),
      fallbackType: sc._last?.fallbackType,
    });
  }
  return perScenario;
}

// ---------------------------------------------------------------------------
// Cache: leitura com cache quente vs reconstrucao com cache frio
// ---------------------------------------------------------------------------
function runCacheLayer() {
  const cold = [];
  const hit = [];
  const fingerprint = 'bench-fp-2026-10-h6';

  for (let i = 0; i < WARMUP + ITERATIONS; i++) {
    // FRIO: cache invalidado -> precisa reconstruir o snapshot e gravar.
    invalidateConsultativeSnapshotCache();
    const t0 = performance.now();
    const snapshot = buildSnapshot();
    setCachedConsultativeSnapshot(PERIOD, fingerprint, snapshot);
    const t1 = performance.now();

    // QUENTE: leitura direta do cache com o mesmo fingerprint.
    const got = getCachedConsultativeSnapshot(PERIOD, fingerprint);
    const t2 = performance.now();

    if (i >= WARMUP) {
      cold.push(t1 - t0);
      hit.push(t2 - t1);
      if (!got) throw new Error('cache deveria ter acertado com fingerprint identico');
    }
  }
  return { coldBuildAndStore: summarize(cold), warmRead: summarize(hit) };
}

// ---------------------------------------------------------------------------
// Camada C — REAL (pendente sem credencial)
// ---------------------------------------------------------------------------
function realLayerStatus() {
  const cfg = getGeminiRuntimeConfig();
  return {
    status: cfg.hasValidApiKey ? 'AVAILABLE' : 'PENDING_CREDENTIALS',
    reason: cfg.hasValidApiKey
      ? 'Chave presente; executar com --real para medir contra a API.'
      : 'GEMINI_API_KEY ausente ou invalida: latencia real NAO medida (nao estimada).',
    fastModel: cfg.fastModel,
    advancedModel: cfg.advancedModel,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const started = new Date().toISOString();
const internal = await runInternalLayer();
const simulated = await runSimulatedLayer();
const cache = runCacheLayer();
const real = realLayerStatus();

const report = {
  generatedAt: started,
  environment: {
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? 'desconhecido',
    totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
    iterations: ITERATIONS,
    warmup: WARMUP,
    mockProviderLatencyMs: MOCK_PROVIDER_LATENCY_MS,
  },
  layers: {
    A_internal: internal,
    B_simulated: simulated,
    C_real: real,
  },
  cache,
  observability: getAIObservabilityMetrics(),
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const ms = (s) => `p50=${round(s.p50)}ms p95=${round(s.p95)}ms p99=${round(s.p99)}ms`;
  console.log('=== FinAI — Benchmark do Copiloto (Sprint 6, Fase 5) ===\n');
  console.log(`Ambiente: Node ${process.version} | ${report.environment.platform} ${os.arch()} | ${report.environment.cpus} CPUs`);
  console.log(`Amostra: ${ITERATIONS} iteracoes apos ${WARMUP} de aquecimento | provedor simulado: ${MOCK_PROVIDER_LATENCY_MS}ms\n`);

  console.log('--- CAMADA A: INTERNA (zero rede) ---');
  console.log('cenario'.padEnd(30), 'rota'.padEnd(10), 'snapshot', 'determ.', 'TOTAL');
  for (const s of internal) {
    console.log(
      s.id.padEnd(30),
      s.route.padEnd(10),
      ms(s.snapshot).padEnd(34),
      ms(s.deterministic).padEnd(34),
      ms(s.total)
    );
  }

  console.log('\n--- CAMADA B: SIMULADA (provedor falso, zero rede real) ---');
  for (const s of simulated) {
    console.log(
      s.id.padEnd(30),
      ms(s.total).padEnd(34),
      `chamadas/iter=${round(s.providerCallsPerIteration)}`,
      `fallback=${s.fallbackType}`
    );
  }

  console.log('\n--- CACHE ---');
  console.log('frio (reconstroi + grava):', ms(cache.coldBuildAndStore));
  console.log('quente (leitura direta)  :', ms(cache.warmRead));

  console.log('\n--- CAMADA C: REAL ---');
  console.log(`status: ${real.status} — ${real.reason}`);
  console.log(`modelos configurados: fast=${real.fastModel} advanced=${real.advancedModel}`);

  const allInternal = internal.flatMap((s) => s.total);
  const overall = summarize(allInternal.map((s) => s.p50));
  console.log('\n--- RESUMO ---');
  console.log(`p50 interno geral: ${round(overall.p50)}ms | p95: ${round(overall.p95)}ms | p99: ${round(overall.p99)}ms`);
  const mismatched = internal.filter((s) => !s.routeMatchesExpectation);
  console.log(`rotas divergentes da expectativa: ${mismatched.length}`);
  for (const m of mismatched) console.log(`  - ${m.id}: esperado ${SCENARIOS.find((s) => s.id === m.id).expectRoute}, obtido ${m.route}`);
}
