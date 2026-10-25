# FinAI • Terminal Financeiro Institucional com IA Otimizada em Tokens

<p align="center">
  <strong>Plataforma desktop de gestão patrimonial, planejamento orçamentário, inteligência de mercado e diagnósticos financeiros com Open Finance Brasil (Pluggy API v2), B3, Binance e arquitetura multimodelo Google Gemini 3.</strong>
</p>

<p align="center">
  <a href="README.en.md"><strong>English Version</strong></a> •
  <a href="README.md"><strong>Versão em Português</strong></a>
</p>

---

## 1. Visão Geral e Filosofia Arquitetural

A maioria das aplicações financeiras que tentam integrar Large Language Models (LLMs) comete um erro estrutural de engenharia: enviam extratos brutos diretamente para a janela de contexto do modelo. Esse padrão gera três falhas graves:
1. Custos desnecessários com milhares de tokens consumidos em dados repetitivos e voláteis;
2. Alucinações aritméticas em somas, porcentagens e médias (LLMs não são calculadoras determinísticas);
3. Respostas prolixas e genéricas repletas de clichês corporativos (*AI slop*).

O **FinAI** adota uma arquitetura em camadas onde o processamento numérico e as regras contábeis são executados localmente por motores determinísticos sem consumo de tokens. O modelo de inteligência artificial é acionado exclusivamente para análises qualitativas e consultoria estratégica, recebendo um snapshot agregado de dados comprimido.

```
┌────────────────────────────────────────────────────────┐
│ 1. MOTOR MATEMÁTICO DETERMINÍSTICO LOCAL (0 TOKENS)    │
│    • Patrimônio Líquido, Runway, Savings Rate, Alocação│
│    • Matriz 50/30/20, Desvios Orçamentários e P/VP     │
│    • Conciliação de Transferências e Projeções 30/60/90│
└──────────────────────────┬─────────────────────────────┘
                           │ Métricas estruturadas
┌──────────────────────────▼─────────────────────────────┐
│ 2. COMPRESSOR DE SNAPSHOT SINTÉTICO (< 180 TOKENS)     │
│    • Vetor sintético consolidado (Balanço, Deltas,     │
│      Categorias Críticas, Solvência e Queima)          │
│    • Invalidação de cache via fingerprint criptográfico│
└──────────────────────────┬─────────────────────────────┘
                           │ Snapshot serializado
┌──────────────────────────▼─────────────────────────────┐
│ 3. COPILOTO MULTIMODELO (GEMINI 3 ARCHITECTURE)        │
│    • Roteamento inteligente: DIRECT (0 tokens),        │
│      FAST (gemini-3.5-flash-lite) e ADVANCED (3.8-flash│
│    • Diretriz Editorial Anti-AI-Slop v2                │
│    • Resposta estruturada em JSON e SSE streaming      │
└────────────────────────────────────────────────────────┘
```

---

## 2. Stack Tecnológica

- **Framework Web e Runtime:** Next.js 16.4.1 (App Router, Turbopack, React 19, TypeScript 5).
- **Estilização e Interface:** Tailwind CSS, Lucide Icons, Recharts, `font-variant-numeric: tabular-nums`.
- **Banco de Dados e ORM:** SQLite / LibSQL com Drizzle ORM (`finai.db` local com suporte a migrações idempotentes em tempo de inicialização).
- **Open Finance Brasil:** Pluggy API v2 (conectores bancários homologados, contas correntes, cartões, extratos e ponte OAuth MeuPluggy - Conector 200).
- **Provedores de Mercado:**
  - `brapi.dev`: Ações da B3, Fundos Imobiliários (FIIs), BDRs e índices macroeconômicos (Ibovespa, IFIX) com controle de concorrência via `AsyncMutex` e cache stale-while-revalidate.
  - `Binance Spot API`: Cotações de criptoativos em tempo real, paridade BRL via par USDT/BRL e klines históricos para gráficos de candlesticks.
- **Inteligência Artificial:** Google Gemini 3 Architecture via SDK oficial `@google/genai`:
  - Modelo Rápido Principal: `gemini-3.5-flash-lite` (Fallback: `gemini-3.1-flash-lite`).
  - Modelo Analítico Avançado: `gemini-3.8-flash` (Fallback: `gemini-3.6-flash`).
  - Rota Determinística Local (`DIRECT`): 0 tokens consumidos para consultas diretas a métricas calculadas.

---

## 3. Módulos da Plataforma

### A. Terminal de Patrimônio e Balanço Patrimonial (`PatrimonyView`)
- **Patrimônio Líquido Consolidado:** Cálculo em tempo real da identidade contábil $\text{Patrimônio Líquido} = \text{Ativos} - \text{Passivos}$.
- **Consolidação de Ativos:** Contas correntes, reservas de emergência, carteiras de investimento e ativos manuais (imóveis, veículos, participações).
- **Consolidação de Passivos:** Faturas abertas de cartão de crédito, saldo devedor de cheque especial (`OVERDRAFT_DEBT`), financiamentos e empréstimos estruturados.
- **Isolamento de Limite de Crédito:** O limite total concedido em cartões de crédito não é tratado como ativo financeiro.
- **Snapshots Históricos:** Registro temporal de evolução patrimonial com decomposição por classe de alocação (Renda Fixa, Renda Variável, Imóveis, Criptoativos e Liquidez).

### B. Extrato Canônico e Conciliação Tabular (`TransactionsView`)
- **Normalização de Sinais:** Créditos bancários operacionais padronizados como positivos (`CREDIT`), débitos operacionais como negativos (`DEBIT`).
- **Neutralidade de Transferências Próprias (`detectAndReconcileSelfTransfers`):** Pareamento determinístico de saídas e entradas entre contas do mesmo titular, impedindo que movimentações internas inflem receitas ou despesas.
- **Neutralidade no Pagamento de Faturas:** Liquidação de fatura de cartão de crédito a partir de conta corrente não duplica os lançamentos de despesa já reconhecidos individualmente.
- **Estornos e Devoluções:** Estornos abatem o montante de despesa da categoria sem registrar falsa receita operacional.
- **Transações Desconsideradas (`is_ignored`):** Capacidade de ignorar transações pontuais de métricas e orçamentos sem deletar o registro contábil de auditoria.
- **Operações Manuais Atômicas:** Inserção, edição e exclusão de transações manuais com ajuste automático do saldo de conta em transação SQLite.

### C. Planejamento, Recorrências Multiatômicas e Projeções (`BudgetsView`)
- **Gestão de Rendas e Despesas Recorrentes:** Regras mestras (`recurring_flows`) configuráveis por tipo (`INCOME` ou `EXPENSE`), natureza (`FIXED` ou `VARIABLE`) e categoria contábil.
- **Seis Periodicidades Suportadas:**
  - `WEEKLY`: Passo estrito de 7 dias;
  - `BIWEEKLY`: Passo estrito de 14 dias (26 ocorrências/ano, ideal para remuneração quinzenal);
  - `SEMIMONTHLY`: Duas datas fixas no mês (`dayOfMonth` e `secondDayOfMonth`, 24 ocorrências/ano);
  - `MONTHLY`: Mensal com dia de corte e clamping no último dia útil para meses curtos;
  - `QUARTERLY`: Trimestral com salto de 3 meses;
  - `ANNUAL` / `YEARLY`: Anual com salto de 12 meses;
  - `ONCE`: Lançamento previsto pontual.
- **Ocorrências Concretas (`recurring_occurrences`):** Identidade estável no formato `occ_{flowId}_{expectedDate}`, eliminando médias fracionárias estáticas.
- **Projeções de Fluxo de Caixa Móveis (30, 60 e 90 Dias):** Avaliação de receitas e despesas discretas a partir da data de referência, calculando entradas esperadas, saídas esperadas, saldo final projetado e detecção de vales de liquidez intrames (`lowestProjectedBalance` e flag `isNegativeLiquidity`).
- **Motor de Conciliação Determinística:** Algoritmo multicritério (tolerância temporal de $\pm 5$ dias, tolerância monetária de centavos, validação de conta e comparação de descrição textual) com trava automática de ambiguidade (`isAmbiguous` caso a diferença de pontuação entre dois candidatos seja inferior a $0.15$).
- **Separação Epistêmica em 4 Estados:**
  1. `REALIZED`: Transação bancária liquidada;
  2. `EXPECTED`: Ocorrência futura prevista;
  3. `CONFIRMED`: Confirmação administrativa sem duplicar o extrato;
  4. `PROJECTED`: Saldo futuro estimado.
- **Régua Executiva de 8 Indicadores:** Receitas realizadas, receitas previstas, renda recorrente ativa, receitas vencidas não conciliadas, despesas previstas, saldo final projetado, taxa de comprometimento futuro (`futureCommitmentRatePct`, blindada contra divisão por zero) e variância contábil.

### D. Inteligência de Mercado e Cotações (`MarketIntelligenceView`)
- **Mercado B3 (Ações, FIIs, BDRs e Índices):**
  - Cotações e dados cadastrais via adapter `brapi.dev`;
  - Serialização de requisições concorrentes via `AsyncMutex` para proteção contra HTTP 429;
  - Cache em memória com política stale-while-revalidate;
  - Métricas dedicadas para ações: Preço sobre Lucro (P/L), Preço sobre Valor Patrimonial (P/VP), Dividend Yield (DY) e Faixa de 52 Semanas;
  - Métricas dedicadas para Fundos Imobiliários: Dividend Yield anualizado (12m), Último Rendimento distribuído e análise de P/VP com rotulagem explícita de ágio ou desconto patrimonial.
- **Criptoativos Spot (Binance API):**
  - Cotações spot em tempo real para os principais pares de liquidez (BTC, ETH, SOL, BNB);
  - Conversão de paridade em Reais utilizando taxa USDT/BRL em tempo real;
  - Candlesticks históricos com seleção de intervalos (`1d`, `7d`, `1m`, `1y`) e cálculo automático de retorno percentual no período selecionado.
- **Watchlist Integrada:**
  - Adição e remoção de ativos B3 e Cripto com persistência relacional;
  - Definição de preço-alvo e notas analíticas particulares.

### E. Copiloto Financeiro Estratégico (`CopilotView`)
- **Roteamento Dinâmico Multimodelo:**
  - `DIRECT`: Consultas aritméticas diretas resolvidas em 0 tokens pelo motor determinístico;
  - `FAST`: Consultas operacionais do dia a dia roteadas para `gemini-3.5-flash-lite`;
  - `ADVANCED`: Diagnósticos patrimoniais aprofundados, cenários de estresse e projeções de liquidez roteados para `gemini-3.8-flash`.
- **Compressão de Snapshot (< 180 Tokens):** Extração de indicadores essenciais sem expor histórico bruto de lançamentos.
- **Cache Determinístico por Fingerprint:** Hash composto por período, versão de regras e digest de dados (`stateDigest` e `recurringDigest`), invalidando o cache imediatamente após qualquer edição.
- **Segurança de Entrada e Redação de Segredos:** Remoção de CPF, CNPJ, dados bancários, números de cartão e credenciais antes da serialização, com blindagem contra injeção de prompt em descrições de transações.
- **Streaming com Server-Sent Events (SSE):** Resposta progressiva com sinalização de rota e evento terminal `aborted` em caso de cancelamento pelo cliente.

### F. Integração Open Finance Brasil (`OpenFinanceView`)
- **Agregação Bancária Automática:** Conexão direta com instituições financeiras brasileiras via Pluggy API v2.
- **Ponte MeuPluggy (OAuth Conector 200):** Permite sincronização gratuita para usuários pessoa física.
- **Segurança e Idempotência de Webhooks:** Endpoint `/api/pluggy/webhook` com autenticação em tempo constante (`crypto.timingSafeEqual`), desduplicação por `eventId` e bloqueio de concorrência com TTL de 5 minutos contra deadlocks.
- **Modo Sandbox:** Suporte a testes locais com o conector `Pluggy Bank` (`user-ok` / `password-ok`).

---

## 4. O Motor Matemático Determinístico (0 Tokens)

Os cálculos fundamentais são processados localmente pelo módulo `src/lib/ai/math-engine.ts`, eliminando imprecisões e garantindo consistência numérica estrita:

$$\text{Fluxo Líquido (Net Cash Flow)} = \sum \text{Receitas Operacionais} - \sum \text{Despesas Operacionais}$$

$$\text{Taxa de Poupança (Savings Rate)} = \left( \frac{\text{Aportes} + \text{Superávit Operacional}}{\text{Receita Total}} \right) \times 100$$

$$\text{Runway de Sobrevivência (Meses)} = \frac{\text{Saldo Líquido Disponível}}{\text{Despesas Fixas Essenciais Mensais}}$$

$$\text{Desvio Orçamentário (\%)} = \left( \frac{\text{Gasto Real} - \text{Teto Planejado}}{\text{Teto Planejado}} \right) \times 100$$

$$\text{Comprometimento Futuro (\%)} = \begin{cases} 0\%, & \text{se } \text{Receitas Previstas} = 0 \\ \left( \frac{\text{Despesas Previstas}}{\text{Receitas Previstas}} \right) \times 100, & \text{se } \text{Receitas Previstas} > 0 \end{cases}$$

---

## 5. Diretriz Editorial Anti-AI-Slop (v2)

Os diagnósticos do copiloto e as comunicações de interface seguem parâmetros estritos de qualidade textual:
1. **Sem Parataxe Artificial:** Ideias são articuladas com conectivos, subordinações e pontuação natural, rejeitando o ritmo telegráfico de frases curtas sucessivas.
2. **Sem Regra de Três Arbitrária:** Listas e pontos de observação possuem o número de elementos estritamente requerido pelo contexto factual.
3. **Sem Hype ou Retórica Corporativa:** Eliminação de elogios vazios, metáforas dramáticas e julgamentos condescendentes. A comunicação reporta dados, desvios e riscos de solvência de forma direta.
4. **Precisão Pontual:** Valores monetários expressos em Reais com duas casas decimais, referenciando datas e estabelecimentos concretos.

---

## 6. Segurança, Privacidade e Hardening

- **Fronteira de Confiança Local:** O FinAI é projetado prioritariamente como aplicação pessoal local (*local-first*). Os dados residem no banco SQLite local (`finai.db`), mantido fora do controle de versão pelo `.gitignore`.
- **Credenciais Isoladas no Servidor:** As chaves de API (`GEMINI_API_KEY`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`) nunca são serializadas para o cliente nem prefixadas com `NEXT_PUBLIC_`.
- **Tratamento de Erros HTTP 500 (`handleApiError`):** Rotas de API não expõem mensagens de erro cruas (`error.message`) em produção. Detalhes técnicos e caminhos de sistema são registrados no servidor com mascaramento de dados sensíveis (`redactSensitive`), retornando ao cliente um identificador opaco com código seguro.
- **Autenticação em Tempo Constante:** A rota de webhook valida o segredo de autenticação utilizando `crypto.timingSafeEqual` sobre buffers de tamanho alinhado, prevenindo ataques de temporização (*timing attacks*).
- **Sem Custódia de Senhas Bancárias:** A autenticação do Open Finance é gerenciada diretamente pela infraestrutura da Pluggy sob conformidade com as normas do Banco Central do Brasil.

---

## 7. Estrutura do Repositório e Mapa de Rotas

```
finai/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/
│   │   │   │   ├── chat/route.ts                # Streaming SSE e chat com Copiloto
│   │   │   │   └── diagnose/route.ts            # Diagnóstico estruturado em JSON
│   │   │   ├── budgets/route.ts                 # CRUD de tetos e metas orçamentárias
│   │   │   ├── financial-summary/route.ts       # Balanço e fluxo consolidado
│   │   │   ├── goals/[id]/route.ts              # Atualização e exclusão de metas
│   │   │   ├── goals/route.ts                   # Listagem e criação de metas
│   │   │   ├── market/
│   │   │   │   ├── crypto/quote/route.ts        # Cotação spot e klines de cripto
│   │   │   │   ├── crypto/search/route.ts       # Busca de pares de criptoativos
│   │   │   │   ├── overview/route.ts            # Painel consolidado (B3 + Cripto + Macro)
│   │   │   │   ├── stocks/quote/route.ts        # Cotações B3 e métricas fundamentalistas
│   │   │   │   ├── stocks/search/route.ts       # Busca de ações e FIIs
│   │   │   │   ├── watchlist/[id]/route.ts      # Edição e remoção de item da watchlist
│   │   │   │   └── watchlist/route.ts           # Listagem e inserção na watchlist
│   │   │   ├── patrimony/
│   │   │   │   ├── assets/[id]/route.ts         # Edição de ativo patrimonial
│   │   │   │   ├── assets/route.ts              # Cadastro de ativos manuais
│   │   │   │   ├── liabilities/[id]/route.ts    # Edição de passivo patrimonial
│   │   │   │   ├── liabilities/route.ts         # Cadastro de passivos manuais
│   │   │   │   ├── snapshots/route.ts           # Histórico de balanço patrimonial
│   │   │   │   └── route.ts                     # Balanço consolidado atual
│   │   │   ├── planning/
│   │   │   │   ├── occurrences/reconcile/route.ts # Conciliação determinística
│   │   │   │   ├── occurrences/route.ts         # Consulta e pontuação de ocorrências
│   │   │   │   ├── recurring/[id]/route.ts      # Edição de fluxos e regeneração atômica
│   │   │   │   ├── recurring/route.ts           # Cadastro de regras de recorrência
│   │   │   │   └── route.ts                     # Projeções 30/60/90 dias e régua de 8 indicadores
│   │   │   ├── pluggy/
│   │   │   │   ├── connect-token/route.ts       # Sessão OAuth do widget Pluggy
│   │   │   │   ├── connectors/route.ts          # Catálogo de bancos parceiros
│   │   │   │   ├── sync/route.ts                # Sincronização e gravação de extratos
│   │   │   │   └── webhook/route.ts             # Webhook autenticado e idempotente
│   │   │   └── transactions/[id]/route.ts       # Atualização e exclusão atômica
│   │   │   └── transactions/route.ts            # Lançamento manual e filtros
│   │   ├── globals.css                          # Tokens de design e estilização base
│   │   ├── layout.tsx                           # Layout raiz e tipografia
│   │   └── page.tsx                             # Shell principal da aplicação desktop
│   ├── components/
│   │   ├── market/
│   │   │   ├── CryptoMarketSection.tsx          # Painel de criptoativos e gráficos
│   │   │   ├── MarketIntelligenceView.tsx       # Visão geral de mercado e macro
│   │   │   ├── StockMarketSection.tsx           # Painel B3 de ações e FIIs
│   │   │   └── WatchlistCard.tsx                # Cartão de monitoramento de ativos
│   │   ├── ui/
│   │   │   ├── EmptyState.tsx                   # Componente de estado vazio padronizado
│   │   │   ├── FinancialDataTable.tsx           # Tabela com algarismos tabulares
│   │   │   ├── MetricCard.tsx                   # Cartão de métricas e KPIs
│   │   │   ├── PageHeader.tsx                   # Cabeçalho de visualização reutilizável
│   │   │   └── StatusBadge.tsx                  # Badges de status operacionais
│   │   ├── BudgetsView.tsx                      # Orçamentos, metas e ocorrências
│   │   ├── CommandPalette.tsx                   # Paleta de comandos rápidos (Ctrl+K)
│   │   ├── CopilotView.tsx                      # Diagnósticos estratégicos e consultoria IA
│   │   ├── DashboardView.tsx                    # Painel executivo do patrimônio
│   │   ├── Header.tsx                           # Barra superior e status de sincronização
│   │   ├── NewPatrimonialItemModal.tsx          # Modal de ativos e passivos manuais
│   │   ├── NewTransactionModal.tsx              # Modal de lançamentos manuais
│   │   ├── OpenFinanceView.tsx                  # Gerenciador de conexões bancárias
│   │   ├── PatrimonyView.tsx                    # Painel detalhado de balanço patrimonial
│   │   ├── PluggyConnectModal.tsx               # Modal de autenticação Open Finance
│   │   ├── Sidebar.tsx                          # Navegação lateral persistente
│   │   └── TransactionsView.tsx                 # Tabela analítica de movimentações
│   ├── db/
│   │   ├── index.ts                             # Conexão LibSQL e migrações idempotentes
│   │   └── schema.ts                            # Definições relacionais Drizzle ORM
│   └── lib/
│       ├── ai/
│       │   ├── context-builder.ts               # Montagem de contexto e digests
│       │   ├── gemini-client.ts                 # Cliente multimodelo Google Gemini 3
│       │   ├── math-engine.ts                   # Motores aritméticos locais (0 tokens)
│       │   └── snapshot-compressor.ts           # Compressor de snapshot (< 180 tokens)
│       ├── market/
│       │   ├── binance-adapter.ts               # Adapter de cotações Binance Spot
│       │   ├── brapi-adapter.ts                 # Adapter de mercado B3 com AsyncMutex
│       │   ├── market-service.ts                # Cache e consolidação de cotações
│       │   └── types.ts                         # Tipagens canônicas de mercado
│       ├── api-error.ts                         # Tratamento padronizado de erros de API
│       ├── patrimony-engine.ts                  # Motor de balanço patrimonial e liquidez
│       ├── planning-engine.ts                   # Projeções contínuas e conciliação
│       ├── pluggy.ts                            # Cliente da API v2 da Pluggy
│       ├── recurring-engine.ts                  # Calendário gregoriano e conciliação
│       └── transactions.ts                      # Normalização canônica de transações
├── tests/
│   ├── mutacao/
│   │   └── mutate_sprint6.py                    # Harness de teste de mutações
│   ├── alias-hooks.mjs                          # Resolução de imports nos testes
│   ├── alias-register.mjs                       # Registro de loaders ESM
│   ├── copilot-ai.test.ts                       # Testes de integração do Copiloto
│   ├── market-adapters.test.ts                  # Testes unitários dos adapters de mercado
│   ├── market-schema.test.ts                    # Testes de esquema de dados de mercado
│   ├── market-service-cache.test.ts             # Testes de cache e concorrência de cotações
│   ├── market-sprint-m01.test.ts                # Testes de integridade da Sprint M0.1
│   ├── market-ui-and-e2e.test.ts                # Testes ponta a ponta de mercado
│   ├── patrimony.test.ts                        # Testes do motor de balanço patrimonial
│   ├── planning.test.ts                         # Testes de orçamentos e projeções
│   ├── pluggy-sync.test.ts                      # Testes de sincronização bancária
│   ├── sprint6-reliability-audit.test.ts        # Testes de confiabilidade e invariantes
│   ├── sprint6-streaming-abort.test.ts          # Testes de cancelamento de streaming SSE
│   ├── sprint6-streaming-and-endpoints.test.ts  # Testes de protocolos de streaming
│   ├── sprint7-financial-integrity.test.ts      # Testes de integridade contábil
│   ├── sprint7-http-500-security.test.ts        # Testes de segurança de respostas 500
│   ├── sprint7-income-and-occurrences.test.ts   # Testes de rendas e ocorrências
│   ├── sprint7-reconciliation.test.ts           # Testes de conciliação determinística
│   ├── sprint7-sync-and-webhooks.test.ts        # Testes de segurança de webhooks
│   ├── sprint7-1-corrections.test.ts            # Testes de correções da Sprint 7.1
│   └── transactions-flow.test.ts                # Testes de normalização de transações
├── scripts/
│   └── benchmark-copilot.mjs                    # Benchmark de latência e percentis
├── .env.example                                 # Modelo de configuração de variáveis
├── package.json                                 # Manifesto do projeto e dependências
├── pnpm-lock.yaml                               # Lockfile reprodutível
└── README.md                                    # Este documento
```

---

## 8. Como Executar Localmente

### Pré-requisitos
- **Node.js** v20+ instalado (testado em Node v20 e v26);
- Gerenciador de pacotes **pnpm** instalado (`npm install -g pnpm`).

### Passo a Passo

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/BrunoCHRBN/finai.git
   cd finai
   ```

2. **Instale as dependências:**
   ```bash
   pnpm install
   ```

3. **Configure as variáveis de ambiente:**
   Copie o arquivo de exemplo para `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Preencha os valores necessários:
   ```env
   # Open Finance Brasil (Pluggy API v2)
   PLUGGY_CLIENT_ID=seu_client_id_aqui
   PLUGGY_CLIENT_SECRET=seu_client_secret_aqui
   PLUGGY_BASE_URL=https://api.pluggy.ai
   PLUGGY_WEBHOOK_SECRET=seu_segredo_de_webhook_aqui

   # Google Gemini API
   GEMINI_API_KEY=sua_chave_gemini_aqui

   # Provedores de Mercado (Opcional - brapi possui tier gratuito sem token)
   BRAPI_API_KEY=seu_token_brapi_opcional
   ```

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   pnpm run dev
   ```

5. **Acesse a aplicação:**
   Abra [http://localhost:3000](http://localhost:3000) no seu navegador. O banco de dados SQLite local (`finai.db`) será inicializado e receberá as migrações automáticas de forma não destrutiva.

---

## 9. Suíte de Testes, Mutação e Benchmark

### Execução de Testes Automatizados
A suíte completa conta com 213 testes distribuídos em 41 suítes de teste, executados através do test runner nativo do Node.js:
```bash
pnpm test
```

### Testes de Mutação
Para verificar se os testes discriminam regressões reais de negócio, o repositório conta com um harness de mutações (`tests/mutacao/mutate_sprint6.py`) que injeta 13 mutações críticas de integridade financeira e segurança:
```bash
pnpm run test:mutacao
```
*Taxa de detecção: 13/13 mutações detectadas (100%).*

### Verificação de Tipos e Build de Produção
```bash
# Type checking via TypeScript
npx tsc --noEmit

# Análise estática de código via ESLint
pnpm run lint

# Build de produção do Next.js (28 rotas estáticas e dinâmicas)
pnpm run build
```

### Benchmark de Latência do Copiloto
O script mede percentis p50, p95 e p99 em cenários sintéticos nas camadas interna (zero rede) e simulada:
```bash
pnpm run benchmark
```

---

## 10. Relatórios Técnicos de Execução dos Sprints

Para consultar o histórico detalhado de auditorias, mutações, contratos contábeis e melhorias implementadas em cada ciclo de desenvolvimento:

- [Sprint 6: Auditoria de Confiabilidade, Integridade e Segurança](finai_sprint6_execution_report.md) • [English](finai_sprint6_execution_report.en.md)
- [Sprint 7: Recorrências Multiatômicas, Projeções e Conciliação](finai_sprint7_execution_report.md) • [English](finai_sprint7_execution_report.en.md)
- [Sprint 7.1: Revisão Corretiva e Endurecimento de Segurança](finai_sprint7_1_execution_report.md) • [English](finai_sprint7_1_execution_report.en.md)
- [Sprint M0.1: Inteligência de Mercado B3, Cripto e Resiliência de Cotações](finai_sprint_m01_execution_report.md) • [English](finai_sprint_m01_execution_report.en.md)

---

## 11. Licença

Este projeto é distribuído sob os termos da licença [MIT](LICENSE).
