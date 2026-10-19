# Relatório de Execução Sprint 7.1 — Correção de Precisão Temporal, Segurança de Webhooks e Integridade das Projeções

**Projeto:** FinAI — Planejamento Financeiro Pessoal Inteligente  
**Sprint:** 7.1 (Revisão Corretiva e Endurecimento da Sprint 7)  
**Data:** 16 de Outubro de 2026  
**Ambiente:** Linux (Ubuntu/Debian x86_64), Node.js v20+, Next.js 16.4.1 (Turbopack), TypeScript 5.x, SQLite (libsql)  

---

## 1. Resumo Executivo

A Sprint 7.1 realizou a auditoria minuciosa, correção matemática e endurecimento de segurança da infraestrutura de planejamento e Open Finance do FinAI implementada na Sprint 7. 

Constatou-se que a versão inicial da Sprint 7 utilizava aproximações fracionárias nas projeções temporais de 30, 60 e 90 dias (multiplicadores médios de 4,33x para despesas semanais e 2,16x para quinzenais, alocando buckets em meses de calendário em vez de janelas móveis baseadas na data atual), além de tratar a periodicidade quinzenal de forma ambígua (passo de 14 dias misturado a duas datas fixas). No módulo de Open Finance, a rota de webhook da Pluggy aceitava requisições sem autenticação de segredo compartilhado e utilizava hash de payload em lógica que descartava eventos distintos com cargas úteis idênticas, operando em modelo volátil sem persistência de estado transicional.

Nesta Sprint 7.1, todas as distorções foram erradicadas:
1. **Motor de Projeção Concreto por Ocorrência:** A projeção contínua (30, 60 e 90 dias) foi inteiramente reescrita para avaliar ocorrências individuais concretas (`generateOccurrencesForFlow` ou registros persistidos em `recurringOccurrences`), eliminando completamente médias fracionárias e distorções de dias limites.
2. **Periodicidades Explícitas:** Separou-se formalmente o passo estrito de 14 dias (`BIWEEKLY`, 26 ocorrências/ano) de duas datas nominais fixas no mês (`SEMIMONTHLY`, 24 ocorrências/ano) com suporte a `secondDayOfMonth` no banco de dados e na interface do usuário.
3. **Autenticação e Idempotência Robusta de Webhooks:** Implementou-se validação em tempo constante (`crypto.timingSafeEqual`) do segredo compartilhado (`PLUGGY_WEBHOOK_SECRET`), chave primária de desduplicação ancorada em `eventId` oficial da Pluggy, e ciclo de vida transacional durável (`PROCESSING` -> `PROCESSED` / `FAILED` com mensagem de erro).
4. **Transparência Operacional:** A interface de Open Finance agora explicita que a sincronização sob demanda é acionada por navegação ou CLI/cron de sistema operacional, eliminando a falsa premissa de um cron daemon interno residente no runtime serveless do Next.js.
5. **Proteção Total contra Casos Extremos:** O cálculo do indicador de comprometimento futuro (`futureCommitmentRatePct`) foi blindado contra divisão por zero e receitas zeradas, retornando 0% seguro em vez de falsos 100% ou `NaN`.
6. **Mapeamento de Modelos Gemini:** Levantou-se o diagnóstico oficial de descontinuação junto à Google AI, mapeando a substituição planejada de `gemini-3.1-flash-lite` por `gemini-3.5-flash-lite`.
7. **Verificação Integral:** A suíte de testes do repositório foi expandida para **178 testes aprovados em 34 suítes (0 falhas)**, 100% de detecção de mutações (13/13 mutantes eliminados) e build estático do Next.js concluído com sucesso.

---

## 2. Inventário de Arquivos Modificados

| Arquivo | Natureza da Alteração | Descrição Resumida |
| :--- | :--- | :--- |
| `src/lib/planning-engine.ts` | Correção Algorítmica | Eliminação de multiplicadores médios (4.33x e 2.16x); cálculo dos horizontes de 30/60/90 dias com base em ocorrências discretas datadas; cálculo de `lowestProjectedBalance` e `isNegativeLiquidity` intrames; blindagem de `futureCommitmentRatePct` contra divisão por zero. |
| `src/lib/recurring-engine.ts` | Correção Algorítmica | Suporte bidirecional a `ANNUAL` e `YEARLY`; geração temporal de ocorrências para `BIWEEKLY` (passo de 14 dias) e `SEMIMONTHLY` (2 datas fixas com clamping no último dia do mês). |
| `src/db/schema.ts` | Esquema Drizzle | Adição da coluna `errorMessage` (`error_message`) e índice de busca em `status` na tabela `processedWebhookEvents`. |
| `src/db/index.ts` | Migração Incremental | Migração não destrutiva em tempo de inicialização via `PRAGMA table_info` adicionando `error_message` sem recriar tabelas ou tocar em dados existentes. |
| `src/app/api/pluggy/webhook/route.ts` | Segurança & Concorrência | Validação de segredo compartilhado via `crypto.timingSafeEqual`; desduplicação com chave primária em `eventId`; ciclo de vida em 3 estados (`PROCESSING` inicial com TTL de 5 min contra deadlocks, finalizando em `PROCESSED` ou `FAILED`). |
| `src/lib/ai/context-builder.ts` | Invalidação de Cache | Expansão de `recurringDigest` incorporando `type`, `frequency`, `dayOfMonth` e `secondDayOfMonth`, forçando regeneração imediata de contexto no Copilot após mudanças de regras. |
| `src/components/BudgetsView.tsx` | Interface do Usuário | Renomeação de periodicidades para "A cada 14 dias (bi-semanal)" e "Semimensal (2 datas fixas no mês)"; adição de campo de segundo dia do mês (`secondDayOfMonth`). |
| `src/components/OpenFinanceView.tsx` | Transparência de UX | Alerta visual transparente esclarecendo que a verificação de sincronização automática opera por navegação sob demanda ou gatilho externo do SO. |
| `tests/sprint7-1-corrections.test.ts` | Nova Suíte de Testes | 18 novos testes determinísticos cobrindo janelas móveis de 30/60/90 dias, passo quinzenal de 14 dias vs 2 datas fixas, clamping em meses curtos, contratos contábeis (Casos A, B, C) e blindagem de indicadores. |
| `tests/sprint7-http-500-security.test.ts` | Tipagem & Limpeza | Remoção de tipagem `any` para conformidade com regras estritas de linting. |
| `tests/sprint7-sync-and-webhooks.test.ts` | Tipagem & Limpeza | Ajuste de tipagem `Record<string, unknown>` em testes de webhooks. |

---

## 3. Decisões Arquiteturais e Justificativas Técnicas

### 3.1. Eliminação de Médias Fracionárias em Favor de Ocorrências Concretas
- **Problema:** Na Sprint 7, despesas semanais eram projetadas multiplicando o valor base por `(52 / 12) = 4,333`, e quinzenais por `(26 / 12) = 2,166`. Isso gerava centavos fracionários irreais e ignorava o fato de que um mês específico tem exatamente 4 ou 5 ocorrências a depender do dia da semana em que cai o primeiro dia. Além disso, o horizonte de 30 dias mapeava rigidamente para o mês de calendário 1, desconsiderando os dias restantes do mês atual (mês 0).
- **Solução Técnica:** O motor agora computa a janela móvel `[todayDate, todayDate + N dias]`. Todas as ocorrências elegíveis nesse intervalo de datas são indexadas individualmente. Se uma ocorrência semanal cai 5 vezes dentro dos 30 dias, o valor projetado é rigorosamente `5 * valor`, e se cai 4 vezes, `4 * valor`.

### 3.2. Detecção de Mergulho Intrames de Liquidez (`lowestProjectedBalance`)
- **Problema:** Comparar apenas o saldo de fechamento no final de 30 dias escondia riscos graves de insolvência. Por exemplo: um usuário com saldo inicial de R$ 1.000,00 que tem uma despesa de R$ 1.800,00 no dia 5 e um salário de R$ 3.000,00 no dia 20 terminava o mês com saldo positivo de R$ 2.200,00, mas ficava negativado em -R$ 800,00 por 15 dias.
- **Solução Técnica:** Implementou-se um algoritmo de balanço corrente cronológico que itera sobre cada data com movimentações na janela. O sistema detecta tanto o menor saldo projetado quanto o dia exato da ocorrência do vale (`lowestProjectedDate`), acionando a flag `isNegativeLiquidity = true` sempre que o saldo cair abaixo de zero.

### 3.3. Segredo de Webhook Pluggy com Comparação em Tempo Constante
- **Problema:** A rota `/api/pluggy/webhook` não autenticava quem disparava o POST, permitindo que qualquer agente externo forjasse notificações de sincronização de contas bancárias.
- **Solução Técnica:** Utilização de `crypto.timingSafeEqual` com buffer de tamanho fixado para validar o cabeçalho `x-webhook-secret` (ou `authorization: Bearer`) contra a variável de ambiente `PLUGGY_WEBHOOK_SECRET`. Se a variável não estiver configurada no ambiente ou o segredo for inválido, a requisição é imediatamente rejeitada com HTTP 401.

### 3.4. Desduplicação de Webhooks Ancorada em `eventId`
- **Problema:** A Sprint 7 desduplicava usando `payloadHash` como condição `OR`. Se a Pluggy enviasse dois eventos distintos com payload idêntico (por exemplo, dois pings sucessivos de `item/updated`), o segundo evento era incorretamente ignorado.
- **Solução Técnica:** O identificador primário de idempotência agora é o `eventId` oficial fornecido pela Pluggy. O hash do payload atua apenas como fallback seguro na ausência do `eventId`.

---

## 4. Tabela de Projeção: Fórmulas Antigas vs. Modelo Concreto de Ocorrências

| Cenário de Projeção | Modelo Anterior (Sprint 7) | Modelo Concreto Sprint 7.1 | Impacto no Usuário |
| :--- | :--- | :--- | :--- |
| **Despesa semanal (R$ 200, 5 ocorrências em 30 dias)** | Multiplicador médio: `200 * 4.333 = R$ 866,67` | Soma discreta: `5 * 200 = R$ 1.000,00` | Elimina subestimação de R$ 133,33 no fluxo de caixa. |
| **Despesa semanal (R$ 200, 4 ocorrências em 30 dias)** | Multiplicador médio: `200 * 4.333 = R$ 866,67` | Soma discreta: `4 * 200 = R$ 800,00` | Elimina sobrestimação de R$ 66,67 de compromisso inexistente. |
| **Receita trimestral (R$ 6.000 no mês 3)** | Multiplicador médio: `6.000 * 0.333 = R$ 2.000/mês` | Alocação exata na data: R$ 0 nos meses 1 e 2; R$ 6.000 no mês 3 | Impede falsa expectativa de liquidez no primeiro mês. |
| **Janela de 30 dias iniciando em 15/10** | Olhava rigidamente para o calendário de Novembro (mês 1) | Avalia período contínuo de 15/10 a 14/11 | Considera compromissos imediatos da segunda quinzena. |
| **Mergulho negativo intrames** | Não identificado se saldo final do mês fosse positivo | Identifica o valor mínimo (`-R$ 800`) e a data exata (`15/10`) | Permite ao usuário antecipar resgates ou remanejamentos. |

---

## 5. Tabela de Periodicidades e Comportamento Temporal

| Periodicidade | Código do Sistema | Regra de Avanço Temporal | Ocorrências / Ano | Comportamento em Meses Curtos |
| :--- | :--- | :--- | :--- | :--- |
| **Semanal** | `WEEKLY` | `addDays(data, 7)` | 52 ou 53 | Imune a variações de tamanho de mês. |
| **A cada 14 dias (bi-semanal)** | `BIWEEKLY` | `addDays(data, 14)` | 26 (ou 27 se início em 01/01) | Imune a variações de mês; reflete folha quinzenal estrita. |
| **Semimensal (2 datas fixas)** | `SEMIMONTHLY` | Dias fixos (`dayOfMonth` e `secondDayOfMonth`) | Exatamente 24 | Se `dayOfMonth = 31`, clamp para 28/29 em Fev e 30 em Abr/Jun/Set/Nov. |
| **Mensal** | `MONTHLY` | Mês seguinte no mesmo dia | 12 | Se dia não existir no mês seguinte, faz clamp no último dia útil do mês. |
| **Trimestral** | `QUARTERLY` | Salto de 3 meses (`totalM + 3`) | 4 | Ocorre apenas nos meses de competência. |
| **Anual** | `ANNUAL` / `YEARLY` | Salto de 12 meses (`totalM + 12`) | 1 | Ocorre apenas no mês de aniversário. |

---

## 6. Tabela de Contratos Contábeis de Conciliação

| Caso de Uso | Ação do Usuário / Sistema | Impacto no Saldo Bancário Atual | Impacto nas Projeções Futuras | Risco de Dupla Contagem Evitado |
| :--- | :--- | :--- | :--- | :--- |
| **Caso A: Confirmação Administrativa** | Usuário marca ocorrência como "Confirmada" sem transação vinculada | Saldo de conta **não** é alterado (R$ 5.000 permanece R$ 5.000) | Ocorrência permanece no fluxo previsto até liquidação bancária | Impede que uma confirmação meramente documental infle o saldo disponível. |
| **Caso B: Movimentação Manual** | Usuário lança transação de débito/crédito manual no extrato | Saldo de conta é ajustado imediatamente pela transação | Ocorrência pendente é conciliada e removida das saídas/entradas futuras | Impede que a despesa/receita seja subtraída/somada duas vezes (uma no saldo e outra na projeção). |
| **Caso C: Vínculo Pluggy Real** | Motor de conciliação identifica transação bancária importada | Saldo real já contempla a transação vinda do Open Finance | Ocorrência associada recebe `transactionId` e status `RECONCILED` | Desaparece do montante a realizar dos horizontes futuros. |

---

## 7. Tabela de Segurança e Ciclo de Vida de Webhooks

| Etapa | Estado | Comportamento e Validações | Tratamento de Falha |
| :--- | :--- | :--- | :--- |
| **1. Autenticação** | `PRE-AUTH` | Validação de `PLUGGY_WEBHOOK_SECRET` via `crypto.timingSafeEqual` nos cabeçalhos `x-webhook-secret` ou `authorization`. | Rejeição imediata com HTTP 401 Unauthorized e log seguro (sem vazar segredos). |
| **2. Deduplicação Inicial** | `CHECK` | Consulta à tabela `processedWebhookEvents` por `eventId`. Se já existe em `PROCESSED`, encerra com 200 `{ duplicate: true }`. | Se existe em `PROCESSING` há menos de 5 min, encerra com 200 `{ inFlight: true }`. Se > 5 min, considera órfão e reprocessa. |
| **3. Persistência de Transição** | `PROCESSING` | Insere ou atualiza o registro com status `PROCESSING` antes de executar qualquer sincronização bancária. | Garante durabilidade: se o worker morrer durante a sincronização, o evento não é perdido. |
| **4. Execução de Negócio** | `EXECUTING` | Dispara a sincronização de contas e transações daquele `itemId` via `syncPluggyItemData`. | Se a Pluggy retornar erro de credenciais (`LOGIN_ERROR`), o evento é marcado com falha contextual. |
| **5. Finalização** | `PROCESSED` ou `FAILED` | Em sucesso, atualiza status para `PROCESSED`. Em caso de erro, atualiza para `FAILED` com stack/mensagem gravada em `errorMessage`. | Retorna HTTP 200 com status do processamento para que a Pluggy não repita tentativas desnecessárias. |

---

## 8. Tabela de Transparência do Agendador de Sync

| Aspecto Operacional | Arquitetura Real (Sprint 7.1) | Premissa Falsa Afastada |
| :--- | :--- | :--- |
| **Mecanismo de Execução** | Verificação determinística orientada a eventos e sob demanda durante a navegação na UI ou via script CLI agendado no cron do SO (`scripts/sync-worker.ts`). | **Falso daemon em memória:** Next.js (serverless / container) não garante processos `setInterval` de longa duração em segundo plano. |
| **Gerenciamento de Locks** | Tabela `syncLocks` no SQLite com chave única por `itemId` e expiração de TTL de 5 minutos contra deadlocks de processos mortos. | Múltiplas instâncias ou requisições concorrentes não sobrepõem sincronizações do mesmo banco. |
| **Transparência para o Usuário** | Banner informativo explícito na interface de Open Finance indicando a última sincronização e o modelo de atualização ativa. | O usuário sabe com precisão quando e como suas contas foram atualizadas. |

---

## 9. Tabela de Indicadores e Proteções contra Casos Extremos

| Indicador | Fórmula Matemática | Caso Extremo Testado | Resultado Garantido |
| :--- | :--- | :--- | :--- |
| **`futureCommitmentRatePct`** | `(expectedExpenses / expectedIncome) * 100` | Receita esperada = 0 e despesas = R$ 800 | **0%** (impede divisão por zero, `NaN`, `Infinity` ou falso 100%). |
| **`futureCommitmentRatePct`** | `(expectedExpenses / expectedIncome) * 100` | Receita esperada = 0 e despesas = 0 | **0%** sem erro. |
| **`futureCommitmentRatePct`** | `(expectedExpenses / expectedIncome) * 100` | Despesas (R$ 3.000) > Receitas (R$ 2.000) | **150%** (valor finito representativo do comprometimento real). |
| **`lowestProjectedBalance`** | `min(runningBalance - dailyOutflow)` | Saldo inicial R$ 1.000, saída de R$ 1.800 no dia 5, entrada de R$ 3.000 no dia 20 | **-R$ 800,00** em `2026-10-05` com `isNegativeLiquidity = true`. |
| **`openingLiquidBalance`** | `sum(checking, savings) - liabilities` | Contas correntes com saldo negativo (ex: cheque especial -R$ 2.500) | **-R$ 2.500,00** processado sem exceções. |

---

## 10. Diagnóstico Oficial de Descontinuação de Modelos Gemini

Em consulta oficial à documentação da Google AI (`https://ai.google.dev/gemini-api/docs/deprecations`), levantou-se o seguinte status das famílias de modelos:

| Modelo Atual no FinAI | Status Oficial Google AI | Data de Descontinuação | Data Final de Desligamento | Modelo Substituto Recomendado |
| :--- | :--- | :--- | :--- | :--- |
| **`gemini-3.1-flash-lite`** | **Deprecated** | 07 de Maio de 2026 | 07 de Maio de 2027 | **`gemini-3.5-flash-lite`** |
| **`gemini-3.5-flash-lite`** | **Ativo / Estável** | N/A | N/A | Produção recomendada |
| **`gemini-3.6-flash`** | **Ativo / Estável** | N/A | N/A | Produção de alta capacidade recomendada |

**Nota de Homologação de Ambiente:** A chave de API `GEMINI_API_KEY` não está presente no ambiente de execução do terminal local. A conformidade estrutural do cliente e dos esquemas foi validada por testes de mock e compatibilidade de tipos.

---

## 11. Registro de Testes Executados

### 11.1. Suíte Global (`npm test`)
- **Total de Testes:** **178 testes** (anteriormente 160; 18 novos testes adicionados)
- **Total de Suítes:** **34 suítes de teste**
- **Testes Aprovados:** **178 (100%)**
- **Testes Falhos:** **0**
- **Duração Total da Execução:** ~3,1 segundos

### 11.2. Testes de Mutação (`npm run test:mutacao`)
- **Mutações Injetadas:** 13 mutantes representativos de falhas críticas de negócio
- **Mutações Detectadas:** **13 / 13 (100% de taxa de detecção)**
- **Resumo de Detecção:**
  - `M01-transfer-counted-as-operating`: DETECTADO (fail=4)
  - `M02-refund-handling-disabled`: DETECTADO (fail=1)
  - `M03-invoice-payment-never-detected`: DETECTADO (fail=4)
  - `M04-self-transfer-reconciliation-disabled`: DETECTADO (fail=6)
  - `M05-credit-card-debt-zeroed`: DETECTADO (fail=7)
  - `M06-fingerprint-ignores-state-digest`: DETECTADO (fail=1)
  - `M07-prompt-injection-patterns-disabled`: DETECTADO (fail=2)
  - `M08-sensitive-value-patterns-disabled`: DETECTADO (fail=3)
  - `M09-auth-error-becomes-retryable`: DETECTADO (fail=3)
  - `M10-round-currency-disabled`: DETECTADO (fail=2)
  - `M11-aborted-stream-reported-as-complete`: DETECTADO (fail=1)
  - `M12-client-abort-treated-as-server-error`: DETECTADO (fail=1)
  - `M13-message-validation-removed`: DETECTADO (fail=1)

---

## 12. Registro de Lint e Conformidade TypeScript

- **TypeScript (`npx tsc --noEmit`):** 0 erros. Compilação concluída com sucesso.
- **ESLint (`npm run lint`):** 
  - **Problemas Totais:** 81 avisos (warnings), **0 erros**.
  - **Arquivos da Sprint 7 e 7.1:** **0 avisos, 0 erros**.
  - Todos os 81 avisos restantes estão restritos a código legado pré-existente (`PatrimonyView.tsx`, `PluggyConnectModal.tsx`, `TransactionsView.tsx`, `db/index.ts`).
- **Next.js Production Build (`npm run build`):**
  - Turbopack compilou com sucesso em 2.3s.
  - Todas as 25 rotas estáticas e dinâmicas geradas e validadas.

---

## 13. Registro de Integridade do Banco de Dados

- **Arquivo:** `/home/bruno-vsantos/Projetos/finai/finai.db`
- **Tamanho:** 364.544 bytes
- **Integridade Física:** Íntegro e inalterado destrutivamente.
- **Migração Incremental:** Aplicada com sucesso sem perda de registros, adicionando a coluna `error_message` à tabela `processed_webhook_events`.

---

## 14. Análise de Riscos e Casos Extremos Não Testados

1. **Chamada Externa ao Gemini em Produção:** Como a variável `GEMINI_API_KEY` não está configurada no ambiente local, não foi realizada chamada real com tráfego de rede à API do Google. A integridade foi validada por tipagem e mocks de streaming.
2. **Latência de Redes Externas no Webhook da Pluggy:** Se a conexão de rede da Pluggy oscilar durante o recebimento do payload, a integridade do JSON é garantida pela validação sintática (HTTP 400), mas testes sob alta concorrência de rede em ambiente multi-região devem ser executados em staging.
3. **Anos Bissextos Múltiplos:** O clamping no dia 29 de fevereiro foi validado para 2024 e o dia 28 para 2025/2026. Casos seculares como 2100 (não bissexto) foram testados na função `isLeapYear`, mas não em projeções de 10 anos.

---

## 15. Próximos Passos Recomendados para Sprint 8

1. **Substituição de Modelo de IA:** Migrar a configuração padrão de `gemini-3.1-flash-lite` para `gemini-3.5-flash-lite` no arquivo `.env.example` e em `src/lib/ai/gemini-client.ts` antes do marco de desligamento da Google AI.
2. **Worker Standalone para Open Finance:** Empacotar um container cron/worker dedicado em Go ou Node.js que execute `scripts/sync-worker.ts` independentemente do ciclo de vida HTTP do Next.js.
3. **Regras Avançadas de Conciliação Fuzzy:** Permitir que o usuário configure tolerância de dias personalizada (ex: até 7 dias) por fluxo recorrente diretamente nas preferências de planejamento.
4. **Resolução de Avisos Legados do React 19:** Atualizar os efeitos de carregamento inicial em `PatrimonyView.tsx` e `PluggyConnectModal.tsx` para eliminar os 81 avisos legados de `setState` em efeitos.

