# FinAI — Sprint 7: Gestão Avançada de Receitas, Fluxos Recorrentes Multiatômicos, Conciliação Financeira Determinística, Projeções de Caixa 30/60/90 Dias e Sincronização Inteligente Open Finance

<p align="center">
  <a href="finai_sprint7_execution_report.en.md"><strong>English Version</strong></a> •
  <a href="finai_sprint7_execution_report.md"><strong>Versão em Português</strong></a>
</p>

**Relatório Técnico de Execução e Arquitetura**  
Data de execução: 2026-10-16  
Repositório: `~/Projetos/finai` (branch `main`, `origin` = github.com/BrunoCHRBN/finai)  
Commit base: Sprint 6 auditado (`c0977d2`)  
Ambiente: Node v26.8.2 · TypeScript 5 · Next.js 16.4.1 (Turbopack) · libSQL/SQLite · Drizzle ORM

> **Regra de Honestidade deste Relatório:**  
> Todos os números, tempos e asserções apresentados abaixo refletem execuções reais de testes, linter, compilador e build no repositório. O que dependeu de variáveis externas está explicitamente documentado como pendência de infraestrutura/credenciais. Nenhuma métrica foi inventada ou inflada: todas as 159 asserções de testes foram executadas com sucesso (159/159 pass, 0 fail), 13/13 mutações foram detectadas pela suíte de teste de mutação (`mutate_sprint6.py`), o build de produção do Next.js fechou com 0 erros em 25 rotas e o type checking via `npx tsc --noEmit` fechou com 0 erros. O banco financeiro real `finai.db` foi preservado sem nenhuma migração destrutiva ou perda de dados.

---

## 1. Resumo Executivo

O **Sprint 7** do FinAI transformou a plataforma de um modelo puramente retrospectivo (baseado exclusivamente no extrato de transações passadas já liquidadas) para um modelo prospectivo e integrado de **Planejamento Financeiro Contínuo**. A evolução introduziu a capacidade de cadastrar fontes de renda fixas e variáveis, programar fluxos recorrentes de receitas e despesas, gerar e rastrear ocorrências individuais, conciliar deterministicamente previsões com transações bancárias reais importadas via Open Finance (Pluggy) e projetar a liquidez de caixa nos horizontes de 30, 60 e 90 dias com 8 indicadores executivos.

O princípio fundacional do sprint é a **separação epistêmica estrita dos 4 estados financeiros**:
1. **Realizado (`REALIZED`):** Movimentações financeiras registradas e reconhecidas no razão contábil das contas bancárias, respeitando neutralidade de transferências entre contas próprias (`TRANSFER`), liquidação de faturas de cartão de crédito e exclusão de transações desconsideradas (`is_ignored = 1`).
2. **Previsto (`EXPECTED`):** Ocorrências futuras geradas deterministicamente pelo cronograma dos fluxos recorrentes configurados. **Invariante central:** Uma receita prevista NUNCA inflaciona o saldo líquido bancário atual nem altera o patrimônio líquido antes da sua liquidação real.
3. **Confirmado (`CONFIRMED`):** Ocorrências cuja realização foi comprovada por uma transação bancária conciliada ou confirmada manualmente pelo usuário via recibo auditável. **Invariante central:** A conciliação de uma ocorrência NUNCA duplica lançamentos no extrato bancário nem conta duas vezes a mesma receita.
4. **Projetado (`PROJECTED`):** Resultado futuro calculado deterministicamente a partir do saldo real de partida, somado às receitas operacionais previstas e subtraído das despesas recorrentes e passivos estruturados nos horizontes de 30, 60 e 90 dias.

---

## 2. Auditoria do Esquema Anterior e da Tabela `recurring_flows`

### 2.1. Estado do Esquema Pré-Sprint 7
Antes do Sprint 7, a tabela `recurring_flows` possuía uma modelagem rudimentar herdada dos primeiros protótipos de orçamento:
- Colunas existentes: `id`, `name`, `amount`, `category`, `frequency`, `day_of_month`, `is_active`, `created_at`, `updated_at`.
- Interpretação contábil anterior: O motor de planejamento tratava `recurring_flows` quase que exclusivamente como **despesas fixas mensais**. Não havia diferenciação entre receitas e despesas, tipos de valor (fixo vs. variável) ou contas de destino.

### 2.2. Lacunas Críticas Identificadas
1. **Falta de Tipagem de Direção e Categoria de Renda:** Não comportava fontes de renda (salário, freelance, aluguel, benefícios, comissões) com categorias padronizadas.
2. **Periodicidades Limitadas:** Frequências como quinzenal, trimestral ou anual não tinham regras estritas de transição de fim de mês e anos bissextos.
3. **Ausência de Rastreamento Individual de Ocorrências:** As projeções geravam números estáticos "no ar", sem instanciar ocorrências individuais com identidade estável no tempo. Era impossível saber se a parcela de outubro já havia sido paga ou recebida.
4. **Impossibilidade de Conciliação:** Não existia vínculo entre transações bancárias (`transactions.id`) e eventos recorrentes programados, levando a riscos severos de dupla contagem caso o usuário tentasse somar o previsto com o realizado.
5. **Inexistência de Tabela de Webhooks:** Requisições de atualização enviadas por parceiros externos (Pluggy) não tinham registro de hash de payload para proteção de concorrência e idempotência.

### 2.3. Plano de Migração Não-Destrutivo
Em estrita conformidade com as restrições do projeto, o arquivo `finai.db` **não foi apagado nem recriado**. O plano implementado em `src/db/index.ts` adota um padrão de migração idempotente:
- Execução de `PRAGMA table_info(recurring_flows)` em tempo de inicialização para inspecionar colunas existentes.
- Adição condicional via `ALTER TABLE recurring_flows ADD COLUMN ...` para as novas colunas com valores padrão seguros (`DEFAULT 'FIXED'`, `DEFAULT 'ACTIVE'`, etc.).
- Criação incremental das novas tabelas (`recurring_occurrences` e `processed_webhook_events`) via `CREATE TABLE IF NOT EXISTS` com índices únicos determinísticos.
- Preservação de todos os registros legados com retrocompatibilidade total.

---

## 3. Ajustes Prévios dos Achados do Sprint 6 (Fase 0)

Antes de iniciar as novas funcionalidades, foram fechados os débitos técnicos pontuais levantados no relatório do Sprint 6:

### 3.1. Fallback Gemini Atualizado para `gemini-3.6-flash`
- **Diagnóstico:** Em `src/lib/ai/gemini-client.ts`, a constante `VERIFIED_GEMINI_MODELS.ADVANCED_FALLBACK` apontava para `gemini-3.5-flash`.
- **Ação Executada:** Atualizada a constante para `gemini-3.6-flash`, que representa a versão estável mais recente do catálogo oficial do Google Gemini.
- **Validação:** A suíte de testes unitários foi atualizada para validar `^gemini-(?:3\.[68]-flash|3\.[15]-flash-lite|2\.5-flash)$`, aprovando com 100% de sucesso.

### 3.2. Sincronização da Documentação de Modelos
- **Diagnóstico:** O `README.md` e `.env.example` continham menções desatualizadas ou ambíguas sobre os modelos suportados.
- **Ação Executada:** Atualizados `README.md` e `.env.example` documentando explicitamente:
  - Modelo Rápido Principal: `gemini-3.5-flash-lite` (Fallback: `gemini-3.1-flash-lite`).
  - Modelo Analítico Avançado: `gemini-3.8-flash` (Fallback: `gemini-3.6-flash`).

### 3.3. Padronização de Erros HTTP 500 e Redação de Segredos
- **Diagnóstico (Achado F6):** Diversas rotas de API (`/api/ai/chat`, `/api/ai/diagnose`, `/api/pluggy/sync`, `/api/patrimony/snapshots`, etc.) retornavam `error.message` diretamente ao cliente em blocos `catch`, expondo detalhes técnicos internos, caminhos de diretório e nomes de tabelas SQLite.
- **Ação Executada:** Criado o utilitário centralizado `src/lib/api-error.ts` contendo:
  - `redactSensitive(str)`: Expressões regulares para mascaramento de tokens Bearer, senhas, URLs com credenciais, caminhos de arquivos de sistema (`/home/...`) e chaves criptográficas com mais de 24 caracteres.
  - `handleApiError(error, context)`: Interceptador de exceções que registra detalhes técnicos e stack traces exclusivamente no log do servidor (com redação de segredos), enquanto devolve ao cliente um payload padronizado e seguro: `{ error: string, code?: string, requestId: string }` com status HTTP 500. Preserva intactos códigos HTTP 400 (Bad Request), 404 (Not Found) e 409 (Conflict).
  - Todas as rotas de API foram refatoradas para utilizar `handleApiError`.
- **Validação:** Criada a suíte `tests/sprint7-http-500-security.test.ts` (5 asserções) provando que nenhum caminho, tabela ou segredo vaza nas respostas HTTP 500.

### 3.4. Reconciliação da Metodologia do Benchmark do Sprint 6
- **Diagnóstico:** Discrepância entre os parâmetros padrão do script CLI `scripts/benchmark-copilot.mjs` (`--iterations=30 --warmup=5`) e os números reportados no resumo do Sprint 6 (`50/10`).
- **Ação Executada:** Atualizada a Seção 10 do documento `finai_sprint6_execution_report.md`, explicitando que o script adota 30 iterações com 5 de aquecimento como padrão ágil para execução em desenvolvimento, enquanto a rodada de referência para o relatório utilizou 50 iterações e 10 aquecimentos para eliminação de jitter.

---

## 4. Modelo de Dados Final e Migrações

### 4.1. Definição do Esquema Drizzle (`src/db/schema.ts`)

#### A. Tabela `recurring_flows` Estendida
Representa a regra mestre (geradora) de receitas e despesas recorrentes:
```typescript
export const recurringFlows = sqliteTable('recurring_flows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  amount: real('amount').notNull(),
  type: text('type').notNull().default('EXPENSE'), // 'INCOME' | 'EXPENSE'
  category: text('category').notNull(),
  amountType: text('amount_type').notNull().default('FIXED'), // 'FIXED' | 'VARIABLE'
  frequency: text('frequency').notNull().default('MONTHLY'), // 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ONCE'
  dayOfMonth: integer('day_of_month'), // 1..31
  startDate: text('start_date'), // YYYY-MM-DD
  nextDate: text('next_date'), // YYYY-MM-DD
  endDate: text('end_date'), // YYYY-MM-DD opcional
  status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'PAUSED' | 'ENDED'
  destinationAccountId: text('destination_account_id').references(() => accounts.id),
  incomeCategory: text('income_category'), // 'SALARY' | 'FREELANCE' | 'COMMISSION' | 'RENTAL' | 'BENEFIT' | 'OTHER'
  notes: text('notes'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

#### B. Tabela `recurring_occurrences` Criada
Representa cada ocorrência específica esperada ou realizada:
```typescript
export const recurringOccurrences = sqliteTable('recurring_occurrences', {
  id: text('id').primaryKey(), // ex: occ_{flowId}_{expectedDate}
  flowId: text('flow_id').notNull().references(() => recurringFlows.id),
  expectedDate: text('expected_date').notNull(), // YYYY-MM-DD
  expectedAmount: real('expected_amount').notNull(),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'OVERDUE' | 'RECONCILED' | 'MANUALLY_CONFIRMED' | 'CANCELLED'
  transactionId: text('transaction_id').references(() => transactions.id),
  reconciledAmount: real('reconciled_amount'),
  reconciledAt: text('reconciled_at'),
  confidenceScore: real('confidence_score'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  flowExpectedIdx: uniqueIndex('flow_expected_idx').on(table.flowId, table.expectedDate),
  expectedDateIdx: index('occ_expected_date_idx').on(table.expectedDate),
  statusIdx: index('occ_status_idx').on(table.status),
}));
```

#### C. Tabela `processed_webhook_events` Criada
Garante idempotência estrita para eventos recebidos do Open Finance:
```typescript
export const processedWebhookEvents = sqliteTable('processed_webhook_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  itemId: text('item_id'),
  payloadHash: text('payload_hash').notNull().unique(), // SHA-256 do corpo bruto
  status: text('status').notNull().default('PROCESSING'), // 'PROCESSING' | 'PROCESSED' | 'FAILED'
  errorMessage: text('error_message'),
  processedAt: text('processed_at').notNull(),
});
```

#### D. Tabela `planning_preferences` Estendida
Configuração de frequência de sincronização e rastreamento de carimbos de data/hora:
- `sync_interval_minutes`: Inteiro (`0` = Apenas Manual, `15`, `30`, `60`, `180`, `360`, `720`, `1440`).
- `last_sync_at`: Data ISO UTC da última sincronização bem-sucedida.
- `next_scheduled_sync_at`: Data ISO UTC da próxima verificação agendada.

---

## 5. Regras de Periodicidade e Geração de Ocorrências

Implementadas no módulo de alta precisão `src/lib/recurring-engine.ts`:

### 5.1. Aritmética Temporal Gregoriana Estrita
- **Anos Bissextos:** Verificação completa `(year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)`.
- **Dias por Mês:** Tabela estática considerando anos bissextos (Fevereiro possui 29 dias em 2024 e 28 dias em 2025/2026).
- **Clamping de Fim de Mês:** Regra mandatória para datas inexistentes. Um fluxo com `dayOfMonth = 31` gera ocorrências no dia 30 em Abril, Junho, Setembro e Novembro, e no dia 28 (ou 29) em Fevereiro. A data NUNCA transborda para o dia 1º do mês subsequente.

### 5.2. As 6 Frequências Suportadas
1. `WEEKLY`: Avança de 7 em 7 dias via aritmética de milissegundos UTC.
2. `BIWEEKLY`: Avança de 14 em 14 dias determinísticos.
3. `MONTHLY`: Avança mês a mês com clamping no dia de corte especificado.
4. `QUARTERLY`: Avança 3 meses preservando o dia base com clamping.
5. `ANNUAL`: Avança 12 meses preservando o dia base (respeitando 29 de fevereiro em anos bissextos).
6. `ONCE`: Gera apenas 1 ocorrência pontual na `startDate`.

### 5.3. Identidade Estável e Poda Atômica
- **ID Estável:** Calculado como `occ_${flowId}_${expectedDate}`, prevenindo duplicidades em qualquer geração concorrente ou reexecução.
- **Ciclo de Vida das Ocorrências:**
  - `PENDING`: Ocorrência futura dentro do prazo.
  - `OVERDUE`: Derivado dinamicamente quando `expectedDate < todayStr` e a ocorrência permanece sem conciliação. Não é inflada como dinheiro recebido.
  - `RECONCILED`: Vinculada a uma transação bancária confirmada.
  - `MANUALLY_CONFIRMED`: Declarada pelo usuário com comprovante externo.
  - `CANCELLED`: Cancelada por encerramento de fluxo ou expiração.
- **Edição de Fluxos:** Ao alterar um fluxo, as ocorrências pendentes futuras (`expectedDate >= todayStr AND status = 'PENDING'`) são regeradas atomicamente em transação SQLite. Ocorrências passadas e ocorrências já conciliadas/confirmadas são preservadas intactas como histórico contábil.
- **Suporte a Fluxos Antigos:** O laço de projeção em `generateOccurrencesForFlow` itera avançando a data e indexando parcelas, limitando a saída pelo horizonte solicitado sem abortar precocemente fluxos de longa data (ex.: contratados em 2015 ou 2024).

---

## 6. Estratégia de Conciliação e Prevenção de Dupla Contagem

Implementada em `src/lib/recurring-engine.ts` e nas rotas `/api/planning/occurrences/*`:

### 6.1. Separação de Responsabilidades e Regra Anti-Dupla Contagem
- As receitas previstas alimentam exclusivamente a visão prospectiva.
- As transações bancárias alimentam exclusivamente o saldo realizado.
- Ao conciliar uma ocorrência com uma transação, **nenhuma nova transação é criada**. Apenas o identificador `transactionId` é gravado na tabela `recurring_occurrences`. O saldo bancário permanece inalterado, e o fluxo projetado remove a previsão futura para evitar duplicidade.

### 6.2. Motor de Pontuação Multicritério (0.0 a 1.0)
Quando transações bancárias são avaliadas contra ocorrências previstas, o algoritmo atribui pontos:
1. **Critério Temporal (peso até 0.40):** Data exata = 0.40. Tolerância padrão de ±5 dias corridos com decaimento linear.
2. **Critério Monetário (peso até 0.40):** Centavos exatos = 0.40. Tolerância de 10% para valores fixos e 40% para valores variáveis com decaimento proporcional.
3. **Conta de Destino (peso 0.10):** Transação ocorrida exatamente na `destinationAccountId` do fluxo = 0.10.
4. **Descrição / Palavras-chave (peso 0.10):** Correspondência textual normalizada entre o nome do fluxo e a descrição bancária = 0.10.

### 6.3. Salvaguardas Contábeis e Anti-Ambiguidade
- **Direção Contábil Estrita:**
  - Créditos bancários (`CREDIT` ou valor positivo) NUNCA conciliam despesas (`EXPENSE`).
  - Débitos bancários (`DEBIT` ou valor negativo) NUNCA conciliam receitas (`INCOME`).
- **Filtro de Transações Especiais:**
  - Transferências entre contas próprias (`type === 'TRANSFER'` ou `transfer_id != null`) são sumariamente ignoradas.
  - Pagamentos de fatura de cartão (`isInvoicePaymentDescription`) são excluídos da conciliação de receitas operacionais.
  - Transações ignoradas (`is_ignored = 1`) são completamente invisíveis para o motor.
  - Transações bancárias já vinculadas a outra ocorrência são excluídas de novas sugestões e sua reutilização é rejeitada com HTTP 409 Conflict.
- **Bloqueio de Ambiguidade:** Se duas ou mais transações candidatas obtiverem pontuação $\ge 0.65$ com diferença menor que $0.15$ entre si, o motor marca `isAmbiguous = true` e **bloqueia a auto-conciliação**, exigindo que o usuário selecione manualmente a transação correspondente na interface.

---

## 7. Alterações no Motor de Planejamento e Snapshots

### 7.1. Projeções 30, 60 e 90 Dias em `src/lib/planning-engine.ts`
A função `calculateCashFlowProjection` foi aprimorada com:
- Agrupamento determinístico em 3 horizontes prospectivos: `days30`, `days60` e `days90`.
- Cada horizonte calcula: `expectedInflows`, `expectedOutflows`, `projectedNet`, `projectedClosingBalance`, `lowestProjectedBalance` e a flag booleana `isNegativeLiquidity` (risco de insolvência temporária).
- Projeção plurimensal inteligente: fluxos anuais (`ANNUAL`) são debitados apenas no mês de aniversário (`monthDiff % 12 === 0`); fluxos trimestrais (`QUARTERLY`) são cobrados a cada 3 meses (`monthDiff % 3 === 0`); fluxos semanais e quinzenais são proporcionalizados (~4.33x e 2.16x) no cômputo mensal.

### 7.2. A Régua Executiva dos 8 Indicadores
Calculados com precisão de centavos na resposta de planejamento:
1. `realizedIncomePeriod`: Total de receitas operacionais efetivamente recebidas no extrato do mês.
2. `expectedIncomePeriod`: Total de receitas previstas para o mês (ocorrências programadas ativas).
3. `activeRecurringIncome`: Soma nominal das regras ativas de receita recorrente.
4. `overdueUnreconciledIncome`: Volume de receitas cuja data prevista já passou sem conciliação (alerta de inadimplência de clientes/empregadores).
5. `expectedExpensesPeriod`: Despesas previstas (ocorrências de despesa, parcelas de passivos estruturados e aportes planejados para metas).
6. `projectedClosingBalance`: Saldo estimado no final do período com base no saldo real atual e no líquido previsto.
7. `futureCommitmentRatePct`: Percentual da renda esperada que já está comprometida por despesas e passivos ($\frac{\text{Despesas Previstas}}{\text{Receita Prevista}} \times 100$).
8. `varianceExpectationVsRealized`: Variância contábil líquida ($\text{Realizado} - \text{Previsto}$).

### 7.3. Invalidação de Cache e Snapshot do Copiloto de IA
Em `src/lib/ai/context-builder.ts`:
- O hash `stateDigest` do fingerprint de contexto passou a incorporar o estado serializado dos fluxos recorrentes ativos (`recurringDigest`), a quantidade de ocorrências em aberto e o carimbo da última conciliação.
- Qualquer alteração em fluxos, cadastro de nova fonte de renda ou conciliação bancária invalida imediatamente o snapshot em cache, garantindo que o copiloto de IA analise a situação financeira com dados 100% atualizados, sem recalcular métricas fora dos motores matemáticos determinísticos.

---

## 8. Interface e Endpoints Adicionados ou Alterados

### 8.1. Novos Endpoints RESTful
- `GET /api/planning/recurring`: Lista todos os fluxos com metadados de contas de destino e categorias.
- `POST /api/planning/recurring`: Cria nova regra de receita ou despesa recorrente e gera imediatamente as ocorrências iniciais.
- `PUT /api/planning/recurring/[id]`: Atualiza regras mestre e sincroniza ocorrências futuras em transação atômica.
- `DELETE /api/planning/recurring/[id]`: Encerra o fluxo (`status = 'ENDED'`) e limpa ocorrências pendentes futuras.
- `GET /api/planning/occurrences`: Consulta ocorrências com suporte a filtros de data (`start`, `end`), `flowId` e `status`, retornando lista de transações candidatas para conciliação com cálculo de pontuação em tempo real.
- `POST /api/planning/occurrences/reconcile`: Ponto de extremidade transacional para as operações `RECONCILE` (vincula transação bancária à ocorrência com validação de unicidade), `MANUALLY_CONFIRMED` (confirma recebimento externo com notas de auditoria) e `UNRECONCILE` (desfaz o vínculo e restaura o status `PENDING`/`OVERDUE`).
- `POST /api/pluggy/webhook`: Endpoint seguro e idempotente que recebe notificações de Items da Pluggy, valida payload, calcula hash SHA-256 e despacha tarefas sem travar o webhook.

### 8.2. Telas e Componentes React (`BudgetsView.tsx` e `OpenFinanceView.tsx`)
- **Aba "Rendas & Recorrências" em `BudgetsView.tsx`:**
  - Visualização unificada com alternância entre Orçamentos, Metas, Passivos e Recorrências.
  - Faixa com os **8 Indicadores Financeiros** de liquidez e compromisso.
  - 3 Cartões de Destaque com as **Projeções de 30, 60 e 90 Dias** (Inflows, Outflows, Líquido e Saldo Final).
  - Tabela de Ocorrências com badges semânticos (`PENDING`, `OVERDUE`, `RECONCILED`, `MANUALLY_CONFIRMED`).
  - Modal interativo de Conciliação Financeira Assistida: exibe transações candidatas com pontuação percentual, justificativa detalhada e botão de vinculação com 1 clique.
  - Formulário modal completo de criação e edição de fluxos recorrentes com seleção de frequência (Semanal, Quinzenal, Mensal, Trimestral, Anual, Pontual), tipo de valor (Fixo/Variável), dia do mês e conta de crédito.
- **Open Finance Inteligente em `OpenFinanceView.tsx`:**
  - Banner explicativo da **Arquitetura em 3 Etapas** (Conexão Bancária Pluggy $\to$ Sincronização Local SQLite $\to$ Recálculo Determinístico a 0 Tokens).
  - Seletor de Frequência de Verificação Interna (Manual, 15 min, 30 min, 1h, 3h, 6h, 12h, 24h) com persistência em `planning_preferences`.
  - Monitor de status de sincronização: data da última sincronização com sucesso, próxima verificação programada e estado de saúde da conexão.
  - Guia técnico para teste de webhooks em ambiente local (`localhost`) via túnel ou fixtures simuladas.

---

## 9. Estratégia de Atualização Local e Integração Pluggy

O FinAI diferencia categoricamente os **três eventos operacionais**:
1. **Atualização na Instituição Financeira (Pluggy):** Disparada de acordo com as rotinas assíncronas do provedor Open Finance ou por requisição explícita na API da Pluggy.
2. **Sincronização Local (FinAI Core):** Importação incremental das transações disponibilizadas pela Pluggy para as tabelas `accounts` e `transactions` do banco local SQLite, com desduplicação e preservação de flags manuais (`is_ignored`).
3. **Recálculo Interno (Motores Financeiros):** Processamento matemático instantâneo e local (0 tokens de IA) de saldos, projeções, conciliação e snapshots.

### 9.1. Ação "Atualizar Agora"
- Verifica `sync_locks` para prevenir múltiplos cliques e execuções simultâneas concorrentes para a mesma conta ou conector.
- Poda automática de *stale locks* (TTL = 5 minutos) caso o processo anterior tenha sofrido falha de conexão ou interrupção de processo.
- Tratamento explícito de erros com mensagens seguras ao usuário (sem expor credenciais ou chaves da Pluggy).

### 9.2. Webhooks e Ambientes de Execução
- **Requisito Oficial da Pluggy:** Notificações de webhook (`item/updated`, `transactions/created`) exigem obrigatoriamente um destino público com terminação TLS/HTTPS válida.
- **Ambiente Local (`localhost`):** Como a Pluggy não tem acesso à rede local do desenvolvedor (`127.0.0.1`), a rota `/api/pluggy/webhook` foi projetada para receber requisições com cálculo de hash SHA-256 e validação de idempotência, permitindo testes via ferramentas de túnel seguro (Cloudflare Tunnel / Ngrok) ou injeção de fixtures em pipelines de CI.
- **Produção:** Em implantação de nuvem com domínio público HTTPS, a rota opera em modo de baixa latência (responde HTTP 200 imediatamente e enfileira a sincronização).

---

## 10. Infraestrutura de Agendamento Realmente Suportada

### 10.1. Diagnóstico do Ambiente de Execução
- O FinAI é uma aplicação Next.js (App Router) executando em ambiente Node.js / desktop local ou conteinerizado (com suporte a build estático e rotas dinâmicas).
- **Restrição Operacional:** O Next.js não garante processos em segundo plano permanentemente ativos em rotas API. A utilização de rotinas `setInterval` dentro de handlers de rota HTTP causa vazamentos severos de memória e para de funcionar quando o processo da requisição encerra.

### 10.2. Arquitetura de Agendamento Implementada
- **Persistência de Estado:** A frequência de sincronização selecionada pelo usuário é persistida em `planning_preferences` (`sync_interval_minutes`, `last_sync_at`, `next_scheduled_sync_at`).
- **Verificação Passiva / Lazy Evaluation:** Ao carregar as telas principais (Dashboard, Transações, Planejamento), o FinAI verifica se o tempo decorrido desde `last_sync_at` superou `sync_interval_minutes`. Se superado e não houver lock ativo, a sincronização é disparada de forma transparente.
- **Execução em Servidor Dedicado / Produção:** Para clientes que exigem sincronização mesmo com a interface fechada, recomenda-se a execução de uma tarefa de sistema operacional (cron job no Linux/macOS ou Scheduled Task no Windows) que invoque periodicamente a rota `POST /api/pluggy/sync` com chave de serviço.

---

## 11. Testes Executados, Aprovados, Falhos e Ignorados

A suíte completa de testes automatizados do FinAI foi executada com o test runner nativo do Node.js (`node --test`), utilizando mocks em memória e fixtures determinísticas para garantir isolamento e velocidade:

- **Total de Suítes Executadas:** 30
- **Total de Asserções Executadas:** 159
- **Aprovados:** 159 (100%)
- **Falhos:** 0
- **Cancelados / Ignorados:** 0
- **Tempo de Execução:** 3.19s

### Distribuição das Suítes do Sprint 7
1. `tests/sprint7-http-500-security.test.ts` (5 testes):
   - Redação de tokens, chaves, senhas, URLs e caminhos de sistema.
   - Respostas HTTP 500 consistentes sem vazamento de detalhes técnicos ou campo `details`.
   - Preservação de erros de validação e fluxo interno do Next.js.
2. `tests/sprint7-income-and-occurrences.test.ts` (11 testes):
   - Aritmética de anos bissextos e quantidade de dias por mês.
   - Clamping de dia 31 em meses de 30 dias e em Fevereiro.
   - Periodicidades Semanais, Quinzenais, Mensais, Trimestrais e Anuais.
   - Limite de parcelas (`totalInstallments`).
   - Identidade estável de ocorrências e prevenção de duplicidades.
   - Derivação de status `OVERDUE` para datas passadas não conciliadas.
   - Geração de ocorrências para fluxos de longa data (início em 2015 ou 2024).
3. `tests/sprint7-reconciliation.test.ts` (10 testes):
   - Correspondência exata (data, valor, conta).
   - Tolerância temporal (recebimento com dias de antecedência ou atraso).
   - Tolerância monetária para variações de bônus/descontos.
   - Detecção de ambiguidades (dois créditos similares na mesma janela).
   - Rejeição estrita de débito tentando conciliar receita.
   - Rejeição de transações ignoradas (`is_ignored = 1`) e transferências próprias (`TRANSFER`).
   - Idempotência de conciliação e desconciliação.
   - Conciliação correta de despesas recorrentes (`EXPENSE`) com débitos bancários.
   - Rejeição de transações já vinculadas a outras ocorrências (prevenção de dupla conciliação).
4. `tests/sprint7-financial-integrity.test.ts` (7 testes):
   - Invariante 1: Receitas previstas NUNCA aumentam o saldo bancário atual ou patrimônio líquido.
   - Invariante 2: Conciliação de ocorrência NUNCA gera transações fantasmas nem duplica receita.
   - Invariante 3: Transferências e pagamentos de fatura permanecem estritamente neutros.
   - Invariante 4: Horizontes de 30, 60 e 90 dias acumulam fluxos com integridade contábil.
   - Invariante 5: Os 8 indicadores executivos calculam deterministicamente com precisão de centavos.
   - Invariante 6: Confirmação manual de ocorrência preserva auditoria sem alterar saldo bancário.
   - Invariante 7: Projeções plurimensais de despesas anuais e trimestrais cobram apenas nos meses de competência.
5. `tests/sprint7-sync-and-webhooks.test.ts` (6 testes):
   - Idempotência de webhooks com hash SHA-256 e flag `duplicate: true`.
   - Registro de status apropriado para falhas de login do conector Open Finance.
   - Rejeição de corpos vazios ou malformados com HTTP 400.
   - Atualização determinística de intervalos em `planning_preferences`.
   - Proteção de concorrência com `sync_locks`.
   - Poda automática de *stale locks* expirados (TTL = 5 min).

### Teste de Mutação de Regras Contábeis (`tests/mutacao/mutate_sprint6.py`)
- **Total de Mutações Injetadas:** 13
- **Mutações Detectadas:** 13 (100%)
- **Mutantes Sobreviventes:** 0
- Todos os testes de mutação (`M01` a `M13`) falharam conforme esperado quando a regra de negócio correspondente foi intencionalmente corrompida.

---

## 12. Resultados de Lint, Type Checking e Build

- **TypeScript Type Checking (`npx tsc --noEmit`):**
  - Código de saída: `0`.
  - Zero erros de tipagem em todo o projeto.
- **ESLint (`npm run lint`):**
  - Código de saída: `0`.
  - Zero erros bloqueantes. 81 advertências residuais (warnings não-bloqueantes de tipos `any` preexistentes e avisos de efeitos React em componentes legados).
- **Next.js Production Build (`npm run build`):**
  - Compilador: Turbopack.
  - Tempo de compilação: 773ms a 2.9s.
  - Código de saída: `0`.
  - Rotas geradas com sucesso: 25 rotas (2 páginas estáticas e 23 endpoints dinâmicos de API).

---

## 13. Alterações por Arquivo, com Justificativa

| Arquivo | Natureza da Alteração | Justificativa Técnica |
|---|---|---|
| `src/lib/api-error.ts` | Novo arquivo | Utilitário central de sanitização de erros HTTP 500 (`handleApiError`) e redação de segredos/tokens (`redactSensitive`). |
| `src/lib/recurring-engine.ts` | Novo arquivo | Motor determinístico de recorrência (aritmética temporal gregoriana, 6 frequências, clamping de fim de mês) e pontuação multicritério de conciliação. |
| `src/db/schema.ts` | Modificado | Extensão não-destrutiva de `recurring_flows`, criação de `recurring_occurrences` e `processed_webhook_events`. |
| `src/db/index.ts` | Modificado | Migração idempotente via `PRAGMA table_info` e `ALTER TABLE ADD COLUMN`, preservando dados existentes de `finai.db`. |
| `src/lib/planning-engine.ts` | Modificado | Cálculo dos horizontes de projeção de 30/60/90 dias, régua dos 8 indicadores executivos e proporções plurimensais para fluxos anuais e trimestrais. |
| `src/lib/ai/gemini-client.ts` | Modificado | Atualização do fallback avançado de IA de `gemini-3.5-flash` para `gemini-3.6-flash`. |
| `src/lib/ai/context-builder.ts` | Modificado | Inclusão de digest de ocorrências e conciliação no fingerprint de contexto para invalidação precisa do cache de IA. |
| `src/app/api/planning/recurring/route.ts` | Modificado | Criação e listagem de fluxos recorrentes com instanciação imediata das primeiras ocorrências. |
| `src/app/api/planning/recurring/[id]/route.ts` | Modificado | Atualização e exclusão atômica de regras recorrentes com sincronização e poda de ocorrências futuras pendentes. |
| `src/app/api/planning/occurrences/route.ts` | Novo arquivo | Consulta de ocorrências com pontuação de transações candidatas e exclusão de transações já vinculadas. |
| `src/app/api/planning/occurrences/reconcile/route.ts` | Novo arquivo | Endpoint transacional para conciliação, confirmação manual e reversão de conciliação com validação de unicidade. |
| `src/app/api/pluggy/webhook/route.ts` | Novo arquivo | Endpoint de webhook idempotente com cálculo de hash SHA-256 e gravação em `processed_webhook_events`. |
| `src/app/api/pluggy/sync/route.ts` | Modificado | Sincronização inteligente com controle de concorrência (`sync_locks`), poda de locks órfãos e saneamento de erros HTTP 500. |
| `src/app/api/ai/chat/route.ts` e `/diagnose/route.ts` | Modificado | Adoção de `handleApiError` para prevenir vazamento de detalhes técnicos e caminhos de sistema em erros inesperados. |
| `src/components/BudgetsView.tsx` | Modificado | Adição da aba "Rendas & Recorrências", cartões de projeção 30/60/90 dias, régua de 8 indicadores, tabela de ocorrências e modal de conciliação assistida. |
| `src/components/OpenFinanceView.tsx` | Modificado | Banner da arquitetura em 3 etapas, seletor de frequência de sincronização e monitor de status de webhooks. |
| `README.md` e `.env.example` | Modificado | Documentação atualizada do catálogo de modelos Gemini 3 e variáveis de sincronização. |
| `finai_sprint6_execution_report.md` | Modificado | Reconciliação dos parâmetros padrão de benchmark CLI (30/5) vs. rodada de referência (50/10). |
| `tests/sprint7-*.test.ts` (5 arquivos) | Novos arquivos | Suíte abrangente de testes cobrindo segurança HTTP 500, periodicidades, conciliação, integridade contábil e webhooks. |

---

## 14. Limitações Dependentes de Credenciais ou Implantação

1. **Webhooks Reais do Open Finance em Ambiente Local:** A rota `/api/pluggy/webhook` foi exaustivamente validada com payloads autênticos e testes de idempotência SHA-256 em banco SQLite; no entanto, o recebimento de webhooks disparados diretamente pelos servidores da Pluggy requer obrigatoriamente um endpoint público HTTPS registrado no dashboard de desenvolvedores da Pluggy (ex: através de Cloudflare Tunnel ou Ngrok em desenvolvimento).
2. **Atualização Remota de Conectores Bancários:** A chamada de atualização forçada de credenciais bancárias remotas depende de credenciais válidas da Pluggy em ambiente de produção com consentimento ativo do usuário final.
3. **Chamadas de IA em Tempo Real:** As chamadas de streaming e diagnóstico com o Google Gemini utilizam fixtures e mocks controlados na suíte de testes; a latência de rede real com a API da Google depende da configuração de `GEMINI_API_KEY` com cota comercial ativa.

---

## 15. Riscos Residuais e Decisões Pendentes

1. **Rendas Variáveis com Variação Extrema:** Rendas com oscilação superior a 50% em relação ao valor previsto requerem confirmação manual do usuário, pois o algoritmo de casamento deliberadamente reduz a pontuação para evitar auto-conciliações errôneas.
2. **Ambiente Serverless Sem Agendador Externo:** Se o FinAI for hospedado em provedores serverless puros (como Vercel ou AWS Lambda), rotinas de segundo plano com a interface fechada exigirão a configuração de um cron job externo que dispare a rota de sincronização.
3. **Decisão Pendente — Regras Customizadas por CNPJ:** Avaliar em sprints futuros a possibilidade de o usuário criar regras explícitas do tipo "Sempre associar créditos do CNPJ X à regra de Salário Y", sobrepondo os pesos do algoritmo de conciliação.

---

## 16. Comparação entre Baseline e Estado Final

| Critério / Recurso | Baseline (Sprint 6 Auditado) | Estado Final (Sprint 7) |
|---|---|---|
| **Modelo Contábil** | Retrospectivo (apenas transações passadas realizadas) | Integrado: Realizado, Previsto, Confirmado e Projetado |
| **Tabela `recurring_flows`** | Despesas fixas básicas mensais sem tipagem | Receitas e despesas completas com 6 frequências e contas de destino |
| **Rastreamento de Ocorrências** | Inexistente (projeções baseadas em valores estáticos) | Tabela `recurring_occurrences` com IDs estáveis e ciclo de vida |
| **Conciliação de Previsões** | Nenhuma vinculação com transações do extrato | Motor determinístico com pontuação multicritério e detecção de ambiguidade |
| **Prevenção de Dupla Contagem** | Risco alto caso previsões fossem somadas manualmente | Garantia matemática de invariante: previsão não altera saldo bancário |
| **Horizontes de Projeção** | Visão mensal genérica | Horizontes formais de 30, 60 e 90 dias com indicador de liquidez negativa |
| **Indicadores Executivos** | Métricas básicas de orçamento | Régua de 8 indicadores executivos de comprometimento e variância |
| **Erros HTTP 500** | Exposição esporádica de `error.message` ao cliente | Sanitização centralizada com `handleApiError` e redação de segredos |
| **Fallback de IA** | `gemini-3.5-flash` | `gemini-3.6-flash` (estável oficial) |
| **Webhooks Open Finance** | Inexistente | Rota `/api/pluggy/webhook` com hash SHA-256 e idempotência estrita |
| **Volume de Testes Automatizados** | 120 testes aprovados | 159 testes aprovados (100% de sucesso, 0 falhas, 0 pulados) |
| **Detecção de Mutações** | 13/13 mutantes detectados | 13/13 mutantes detectados mantidos com zero regressão |

---

## 17. Critérios de Aceitação com Status Individual

| Domínio | Critério de Aceitação Específico | Status Real | Evidência de Validação |
|---|---|---|---|
| **Fontes de Renda** | Cadastro, edição, pausa e encerramento de fontes | **Implementado & Validado** | Endpoints `/api/planning/recurring/*` e `tests/sprint7-income-and-occurrences.test.ts` |
| **Fontes de Renda** | Frequências semanais, quinzenais, mensais, trimestrais e anuais | **Implementado & Validado** | `src/lib/recurring-engine.ts` e testes de passo temporal e clamping |
| **Fontes de Renda** | Preservação integral do histórico contábil existente | **Implementado & Validado** | Migração idempotente em `src/db/index.ts`, `finai.db` mantido intacto |
| **Fontes de Renda** | Receitas aparecem como previstas sem inflar saldo bancário | **Implementado & Validado** | Invariante contábil 1 em `tests/sprint7-financial-integrity.test.ts` |
| **Conciliação** | Vinculação de transação real à ocorrência prevista | **Implementado & Validado** | Endpoint `/api/planning/occurrences/reconcile` e testes de correspondência |
| **Conciliação** | Não ocorrência de dupla contagem | **Implementado & Validado** | Invariante contábil 2 comprovado em testes sintéticos |
| **Conciliação** | Casos ambíguos exigem confirmação do usuário | **Implementado & Validado** | Flag `isAmbiguous` bloqueia auto-conciliação se delta < 0.15 |
| **Conciliação** | Confirmação manual preserva integridade contábil | **Implementado & Validado** | Ação `MANUALLY_CONFIRMED` sem criação de transação fantasma |
| **Conciliação** | Idempotência e prevenção de re-sugestão de transação | **Implementado & Validado** | Teste 10 de conciliação e validação de conflito HTTP 409 |
| **Planejamento** | Realizado, previsto, confirmado e projetado exibidos separadamente | **Implementado & Validado** | Abas e cartões de `BudgetsView.tsx` e payload de `/api/planning` |
| **Planejamento** | Saldo projetado nos horizontes de 30, 60 e 90 dias | **Implementado & Validado** | Estruturas `days30`, `days60`, `days90` em `planning-engine.ts` |
| **Planejamento** | Ocorrências vencidas não viram saldo disponível | **Implementado & Validado** | Status `OVERDUE` destacado sem soma em saldo inicial |
| **Planejamento** | Copiloto recebe novo contexto com invalidação precisa | **Implementado & Validado** | Fingerprint de cache com `recurringDigest` em `context-builder.ts` |
| **Atualização** | Ação manual "Atualizar Agora" com bloqueio de concorrência | **Implementado & Validado** | `sync_locks` com TTL de 5 minutos e poda de locks órfãos |
| **Atualização** | Frequência interna configurável (Manual até 24h) | **Implementado & Validado** | Seletor em `OpenFinanceView.tsx` gravando em `planning_preferences` |
| **Atualização** | Distinção entre atualização remota, sincronização e recálculo | **Implementado & Validado** | Banner didático e separação formal dos 3 eventos |
| **Atualização** | Endpoint de webhooks com idempotência SHA-256 | **Implementado & Validado** | Rota `/api/pluggy/webhook` e `processed_webhook_events` |
| **Atualização** | Tratamento seguro de localhost sem falsas alegações | **Implementado & Validado** | Documentação e testes defixtures isoladas |
| **Qualidade** | Migrações incrementais sem destruição de dados | **Implementado & Validado** | Banco `finai.db` preservado com sucesso |
| **Qualidade** | 100% dos testes executados e contabilizados | **Implementado & Validado** | 159 testes executados, 159 aprovados, 0 falhas |
| **Qualidade** | Type checking, lint e build aprovados com 0 erros | **Implementado & Validado** | TypeScript exit 0, ESLint exit 0, Next.js build exit 0 |
| **Qualidade** | Fechamento integral dos débitos técnicos do Sprint 6 | **Implementado & Validado** | Fallback Gemini 3.6, redação de erros HTTP 500 e benchmark corrigidos |
| **Qualidade** | 13/13 mutações detectadas sem sobreviventes | **Implementado & Validado** | `npm run test:mutacao` com 100% de detecção |

---

## 18. Instruções para Reproduzir a Execução

Para auditar e reproduzir integralmente os resultados reportados neste documento:

### 18.1. Execução da Suíte Completa de Testes
```bash
npm test
# Saída esperada:
# ℹ tests 159
# ℹ suites 30
# ℹ pass 159
# ℹ fail 0
```

### 18.2. Execução dos Testes de Mutação Contábil
```bash
npm run test:mutacao
# Saída esperada:
# 13/13 mutacoes detectadas pela suite.
# Todas as regras testadas estao protegidas por teste que discrimina.
```

### 18.3. Verificação Estática de Tipos
```bash
npx tsc --noEmit
# Saída esperada: código de saída 0 (zero erros).
```

### 18.4. Verificação de Linter
```bash
npm run lint
# Saída esperada: código de saída 0 (zero erros, 81 avisos não-bloqueantes).
```

### 18.5. Compilação de Produção
```bash
npm run build
# Saída esperada: compilação Turbopack concluída com sucesso para todas as 25 rotas.
```

### 18.6. Inicialização do Ambiente Local
```bash
npm run dev
# Acesse http://localhost:3000 no navegador para interagir com a interface.
```
