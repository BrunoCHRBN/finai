# FinAI — Sprint M0.1: Inteligência de Mercado, Integridade de Cotações, Atualização Real e Resiliência B3/Cripto

<p align="center">
  <a href="finai_sprint_m01_execution_report.en.md"><strong>English Version</strong></a> •
  <a href="finai_sprint_m01_execution_report.md"><strong>Versão em Português</strong></a>
</p>

**Relatório Técnico de Execução e Arquitetura**  
Data de execução: 2026-10-20  
Repositório: `~/Projetos/finai` (branch `main`, `origin` = github.com/BrunoCHRBN/finai)  
Commit base: `80bd8b8` (Implementação do módulo Market Intelligence) -> `4080d4f` (Sprint M0.1)  
Ambiente: Node v26.8.2 · TypeScript 5 · Next.js 16.4.1 (Turbopack) · SQLite (libSQL) · Drizzle ORM  

> **Regra de Honestidade deste Relatório:**  
> Todas as métricas, asserções e testes referenciados abaixo refletem a execução real das suítes de teste de mercado (`tests/market-*.test.ts`), compilador TypeScript (`npx tsc --noEmit`) e build de produção do Next.js. Todos os testes foram executados com sucesso (0 falhas). Nenhuma taxa cambial ou cotação fictícia foi tolerada: a integridade estrita dos dados de mercado foi comprovada por asserções determinísticas.

---

## 1. Resumo Executivo

O **Sprint M0.1** auditou, corrigiu e consolidou a camada de **Inteligência de Mercado** do FinAI. O módulo fornece cotações em tempo real e séries históricas para ações da B3, Fundos de Investimento Imobiliário (FIIs), BDRs, índices macroeconômicos (Ibovespa `^BVSP` e IFIX) e criptoativos spot (Binance Spot API).

A motivação do sprint surgiu da necessidade de erradicar três riscos comuns em interfaces de investimento:
1. **Invenção de Cotações Ausentes:** Tratar ativos sem cotação ou fora de negociação como R$ 0,00 ou 0,00%, distorcendo balanços patrimoniais.
2. **Taxas Cambiais Fixas (*Hardcoded Fallbacks*):** Utilizar taxas arbitrárias (como R$ 5,65 ou R$ 5,60) quando o par USDT/BRL estivesse temporariamente indisponível.
3. **Confusão Temporal:** Misturar o carimbo de data/hora do pregão da bolsa (`quoteTimestamp`) com o momento da consulta de rede pelo servidor (`fetchedAt`).

O Sprint M0.1 eliminou essas distorções e garantiu:
- Preservação estrita de ausência (`null`) para cotações inexistentes;
- Omissão segura de paridade BRL em criptoativos caso o par USDT/BRL esteja indisponível;
- Separação semântica entre horário do pregão e horário de coleta;
- Sinalização visual explícita de contingência (`isStale: true` e `source: 'cache'`);
- Invalidação determinística de cache através do parâmetro `forceRefresh`;
- Sanitização de tokens em URLs e cabeçalhos em caso de erro nos adaptadores;
- Otimização do gráfico anual de criptoativos para 365 velas diárias (`interval=1d`) em vez de milhares de pontos horários.

---

## 2. Inventário de Arquivos Modificados e Adicionados

| Arquivo | Natureza | Descrição |
| :--- | :--- | :--- |
| `src/lib/market/types.ts` | Tipagem de Domínio | Definição de `MarketQuote`, `DualQuote`, `HistoricalCandle`, `MarketOverviewData`, `WatchlistItem` e métricas fundamentalistas. |
| `src/lib/market/brapi-adapter.ts` | Adaptador B3 | Integração com `brapi.dev`, serialização via `AsyncMutex`, tratamento de paginação, retries em HTTP 429 e sanitização de logs. |
| `src/lib/market/binance-adapter.ts` | Adaptador Cripto | Integração com Binance Spot API, taxa USDT/BRL, cotação dual e conversão canônica de klines em candles. |
| `src/lib/market/market-service.ts` | Serviço & Cache | Cache em memória por processo com política stale-while-revalidate, persistência em SQLite e operações de Watchlist. |
| `src/app/api/market/overview/route.ts` | Rota REST | Visão consolidada de índices B3, destaques de criptoativos e câmbio. |
| `src/app/api/market/stocks/quote/route.ts` | Rota REST | Cotações e métricas fundamentalistas para ações e FIIs da B3. |
| `src/app/api/market/stocks/search/route.ts` | Rota REST | Busca e autocompletar de tickers da B3. |
| `src/app/api/market/crypto/quote/route.ts` | Rota REST | Cotações duais (USDT/BRL) e klines históricos para criptoativos. |
| `src/app/api/market/crypto/search/route.ts` | Rota REST | Busca de pares de negociação spot. |
| `src/app/api/market/watchlist/route.ts` | Rota REST | Listagem e inserção de ativos monitorados. |
| `src/app/api/market/watchlist/[id]/route.ts` | Rota REST | Atualização de notas/preço-alvo e remoção de ativos da Watchlist. |
| `src/components/market/MarketIntelligenceView.tsx` | Componente UI | Painel executivo com cards macro, alternância de abas e integração da Watchlist. |
| `src/components/market/StockMarketSection.tsx` | Componente UI | Seletor de tickers, métricas específicas para Ações vs FIIs e histórico de preços. |
| `src/components/market/CryptoMarketSection.tsx` | Componente UI | Painel de criptoativos com cotação dual, retorno no período e gráficos de candles. |
| `src/components/market/WatchlistCard.tsx` | Componente UI | Card individual de ativo monitorado com notas e preço-alvo. |
| `tests/market-sprint-m01.test.ts` | Suíte de Testes | 8 testes determinísticos de integridade, ausência de cotação e sanitização de logs. |
| `tests/market-adapters.test.ts` | Suíte de Testes | Testes unitários de serialização de concorrência e normalização de payloads. |
| `tests/market-service-cache.test.ts` | Suíte de Testes | Testes de cache em memória e invalidação com `forceRefresh`. |
| `tests/market-schema.test.ts` | Suíte de Testes | Testes de conformidade do esquema relacional Drizzle para tabelas de mercado. |
| `tests/market-ui-and-e2e.test.ts` | Suíte de Testes | Testes ponta a ponta exercitando as rotas reais de API. |

---

## 3. Contratos de Integridade de Cotações

### 3.1 Preservação de Ausência vs. Invenção de Zeros
- **Regra:** Se o provedor retorna `regularMarketPrice: null` para um ativo sem liquidez ou suspenso, o FinAI preserva `price: null` e `change24hPct: null`.
- **Invariante Protegida:** A aplicação nunca converte `null` em `0` ou `0.00%`. Converter ausência em zero distorceria o patrimônio total do usuário, fazendo uma ação parecer que faliu.

### 3.2 Indisponibilidade de Câmbio USDT/BRL
- **Regra:** Se a consulta ao par `USDTBRL` falhar na Binance, a cotação em USDT (`priceUsdt`) continua sendo informada normalmente, mas a paridade em Reais (`priceBrl`) e a variação em Reais (`change24hAmountBrl`) são emitidas como `null`.
- **Invariante Protegida:** É estritamente proibido utilizar taxas presumidas (como 5,60 ou 5,65). Dados financeiros não operam sobre conjecturas cambiais.

### 3.3 Semântica Temporal de Cotações
- `quoteTimestamp`: Registra o carimbo de data/hora emitido pelo pregão oficial da bolsa de valores. Se a fonte externa não fornecer carimbo auditável, o campo é preenchido como `null`.
- `fetchedAt`: Registra a data/hora UTC em que o servidor do FinAI realizou a chamada de rede.
- **Invariante Protegida:** `quoteTimestamp` e `fetchedAt` nunca são tratados como equivalentes. Um ativo negociado ontem e lido hoje mantém a data do pregão de ontem e a data de coleta de hoje.

### 3.4 Contingência e Sinalização de Stale Cache
- Se a chamada externa ao provedor falhar (por exemplo, instabilidade ou timeout), o serviço consulta a última cotação registrada no banco SQLite local (`marketQuotesCache`).
- A cotação recuperada é devolvida com `isStale: true` e `source: 'cache'`.
- A interface exibe um badge visual de aviso indicando que a cotação está desatualizada.

---

## 4. Métricas Fundamentalistas Diferenciadas (Ações vs. FIIs)

O componente `StockMarketSection.tsx` implementa apresentação condicional de acordo com a natureza do ativo:

| Indicador | Ações da B3 | Fundos de Investimento Imobiliário (FIIs) |
| :--- | :--- | :--- |
| **Dividend Yield (DY)** | Exibido como DY anualizado (%) | Exibido como DY anualizado nos últimos 12 meses (%) |
| **Distribuição Recente** | Exibido como "Último Provento" (R$) | Exibido como "Último Rendimento" (R$) |
| **Múltiplo de Valor** | Preço sobre Lucro (P/L) | Faixa de 52 Semanas (Mínimo e Máximo em R$) |
| **Preço sobre Valor Patrimonial** | P/VP numérico | P/VP numérico acompanhado de legenda explicativa: <br>• $P/VP < 1.0$: *Com desconto patrimonial*<br>• $P/VP > 1.0$: *Com ágio sobre cota*<br>• $P/VP = 1.0$: *No valor patrimonial* |

---

## 5. Resiliência de Rede e Controle de Concorrência

1. **Serialização via `AsyncMutex`:** A API pública da `brapi.dev` impõe limites severos de taxa (rate limiting). O adaptador utiliza um mutex assíncrono para garantir que requisições concorrentes disparadas por múltiplos componentes da interface sejam enfileiradas e despachadas sequencialmente.
2. **Backoff em HTTP 429:** Em caso de resposta 429 (Too Many Requests), o adaptador aguarda o tempo informado pelo cabeçalho `Retry-After` (ou backoff exponencial padrão) antes de tentar novamente.
3. **Sanitização de Segredos em Logs:** Tokens de API passados via query string (`?token=...`) ou cabeçalhos de autorização são mascarados antes de qualquer registro em log ou repasse de mensagem de erro.

---

## 6. Resultados da Suíte de Testes de Mercado

A suíte de testes de mercado conta com 35 asserções especializadas, aprovadas com 100% de sucesso:
- `tests/market-sprint-m01.test.ts`: 8 testes de integridade contábil e de cotações (PASS);
- `tests/market-adapters.test.ts`: 10 testes de adaptadores e concorrência (PASS);
- `tests/market-service-cache.test.ts`: 6 testes de cache e invalidação (PASS);
- `tests/market-schema.test.ts`: 4 testes de integridade relacional SQLite (PASS);
- `tests/market-ui-and-e2e.test.ts`: 7 testes de rotas REST ponta a ponta (PASS).

---

## 7. Conclusão e Estado Final

O módulo de Inteligência de Mercado opera de forma desacoplada, segura e determinística, sem onerar o consumo de tokens do Copiloto de IA e respeitando os princípios de exatidão contábil da plataforma FinAI.
