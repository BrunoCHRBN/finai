# FinAI • Terminal Financeiro Institucional com IA Otimizada em Tokens

<p align="center">
  <strong>Plataforma desktop-first de gestão patrimonial, controle orçamentário e inteligência financeira com Open Finance Brasil (Pluggy API v2) e diagnósticos estratégicos via Google Gemini Flash Lite consumindo menos de 850 tokens totais.</strong>
</p>

---

## 1. Visão Geral e Filosofia Arquitetural

A maioria dos aplicativos que tentam integrar modelos de linguagem (LLMs) em finanças pessoais comete um erro de engenharia primário: **despejam milhares de linhas de extrato bruto diretamente na janela de contexto da IA**. O resultado desse padrão é catastrófico:
- Custos exponenciais com milhões de tokens desperdiçados em transações repetidas;
- Alucinações de cálculo em somas, porcentagens e médias (LLMs não são calculadoras determinísticas);
- Respostas genéricas, condescendentes ou corporativas (*AI slop*).

O **FinAI** inverte essa lógica por meio de uma arquitetura de três camadas:

```
┌────────────────────────────────────────────────────────┐
│ 1. MOTOR MATEMÁTICO DETERMINÍSTICO LOCAL (0 TOKENS)    │
│    • Saldo Líquido, Runway, Savings Rate, Alocação     │
│    • Matriz 50/30/20 e Desvios Orçamentários           │
└──────────────────────────┬─────────────────────────────┘
                           │ Métricas estruturadas
┌──────────────────────────▼─────────────────────────────┐
│ 2. COMPRESSOR DE SNAPSHOT SINTÉTICO (< 180 TOKENS)     │
│    • Vetor sintético consolidado (Balanço, Deltas,     │
│      Categorias Críticas, Solvência e Queima)          │
└──────────────────────────┬─────────────────────────────┘
                           │ Snapshot serializado
┌──────────────────────────▼─────────────────────────────┐
│ 3. DIAGNÓSTICO QUALITATIVO VIA GEMINI FLASH LITE       │
│    • Avaliação de Risco & Alocação Tática              │
│    • Anti-AI-Slop Writing Directive v2                 │
│    • Saída em JSON Estruturado (Maturidade 1 a 5)      │
└────────────────────────────────────────────────────────┘
```

---

## 2. Tecnologias Utilizadas

- **Framework Web & Runtime:** Next.js 16.4 (App Router, Turbopack, React 19, TypeScript).
- **Estilização & UI:** Tailwind CSS, Lucide Icons, Recharts, `font-variant-numeric: tabular-nums`.
- **Banco de Dados & ORM:** LibSQL / SQLite com Drizzle ORM (`finai.db` local, com suporte a replicação em nuvem via Turso).
- **Motor de Open Finance:** Pluggy API v2 (Conectores Bancários Brasileiros, Contas, Cartões, Extratos e Ponte OAuth MeuPluggy - Conector 200).
- **Inteligência Artificial:** Google Gemini 2.5 Flash Lite (`@google/genai` SDK) com prompts orientados pela *Anti-AI-Slop Writing Directive v2*.

---

## 3. Módulos e Funcionalidades

### A. Terminal de Patrimônio & Métricas Determinísticas (Dashboard)
- **Patrimônio Líquido Total:** Consolidação instantânea de saldos em conta corrente, reservas e faturas de cartão de crédito.
- **Runway de Sobrevivência:** Cálculo exato de quantos meses a reserva atual cobre com base no custo de vida essencial mensal.
- **Taxa de Poupança Real (Savings Rate):** Percentual da receita convertido em aportes e superávit de caixa.
- **Matriz 50/30/20:** Comparativo dinâmico entre o modelo ideal e a realidade dos gastos (Necessidades Fixas, Gastos Variáveis e Aportes).
- **Atalho Global de Comandos:** Pressione `Ctrl + K` (ou `Cmd + K`) em qualquer tela para acionar a paleta de comandos rápidos.

### B. Extrato Tabular e Conciliação (Transactions)
- Grade de lançamentos com algarismos tabulares estritamente alinhados à direita.
- Categorização automática local por expressões regulares determinísticas (sem queima de tokens).
- Filtros rápidos por instituição, categoria, tipo (Crédito/Débito) e busca em tempo real por estabelecimento.

### C. Alocação e Desvios Orçamentários (Budgets)
- Definição de tetos mensais por categoria essencial e variável.
- Cálculo automático de variância (Orçado vs Realizado) com badges de alerta quando o limite é excedido.

### D. Integração Open Finance Brasil (Pluggy API v2)
- **Conexão Direta:** Suporte a conectores de bancos reais (Itaú, C6 Bank, Caixa, Nubank, Bradesco, Santander, XP, BTG).
- **Ponte Meu Pluggy (Pessoa Física Gratuita):** Autenticação segura via OAuth através do Conector 200 (`MeuPluggy`), permitindo que usuários sincronizem até 5 conexões de bancos reais gratuitamente.
- **Modo Sandbox Integrado:** Testes locais com o banco simulador `Pluggy Bank` (`user-ok` / `password-ok`).

### E. Diagnóstico Estratégico com IA (Copilot)
- Geração de relatórios de consultoria patrimonial sob demanda.
- Análise de maturidade financeira (Níveis 1 a 5).
- Recomendações táticas acionáveis para mitigação de queima de caixa e aceleração de aportes.
- Consumo transparente de tokens exibido a cada ciclo de diagnóstico.

---

## 4. O Motor Matemático (0 Tokens)

Todas as métricas de balanço são calculadas localmente pelo arquivo `src/lib/ai/math-engine.ts`, eliminando alucinações aritméticas:

$$\text{Net Cash Flow} = \sum \text{Receitas} - \sum \text{Despesas}$$

$$\text{Taxa de Poupança (Savings Rate)} = \left( \frac{\text{Aportes} + \text{Superávit}}{\text{Receita Total}} \right) \times 100$$

$$\text{Runway (Meses)} = \frac{\text{Saldo Líquido Total}}{\text{Gastos Fixos Essenciais Mensais}}$$

$$\text{Desvio Orçamentário (\%)} = \left( \frac{\text{Gasto Real} - \text{Teto Planejado}}{\text{Teto Planejado}} \right) \times 100$$

---

## 5. Diretriz Editorial: Anti-AI-Slop Writing Directive v2

Todo o texto gerado pela inteligência artificial e os elementos textuais da interface obedecem rigorosamente à diretriz anti-slop:
1. **Sem Parataxe:** Pensamentos são articulados com conjunções, subordinações e ponto-e-vírgula, evitando a sequência de frases curtas declarativas típica de geradores automáticos.
2. **Sem Regra de Três:** Eliminação de listas artificiais de 3 itens; o conteúdo dita a quantidade natural.
3. **Sem Elogios Corporativos ou Hype:** Comunicação direta, realista e sóbria sobre gargalos de liquidez e riscos patrimoniais.
4. **Sem Exclamações e com Pontuação Restrita:** No máximo um travessão por diagnóstico e pontuação contida.
5. **Dados Concretos:** Nomes reais de estabelecimentos, valores exatos e porcentagens verificáveis.

---

## 6. Estrutura de Diretórios

```
finai/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/diagnose/          # Endpoint de diagnóstico via Gemini Flash Lite
│   │   │   ├── budgets/              # CRUD de orçamentos mensais
│   │   │   ├── financial-summary/    # Consolidação matemática de balanço
│   │   │   ├── pluggy/
│   │   │   │   ├── connect-token/    # Geração de sessão e tokens do widget
│   │   │   │   ├── connectors/       # Catálogo de conectores do Open Finance
│   │   │   │   └── sync/             # Sincronização e gravação de extratos
│   │   │   └── transactions/         # Registro manual e edição de lançamentos
│   │   ├── globals.css               # Design tokens, hairlines e variáveis
│   │   ├── layout.tsx                # Fontes tipográficas e meta tags
│   │   └── page.tsx                  # App Shell desktop principal
│   ├── components/
│   │   ├── BudgetsView.tsx           # Tela de controle de tetos e orçamentos
│   │   ├── CommandPalette.tsx        # Menu rápido de comandos (Ctrl+K)
│   │   ├── CopilotView.tsx           # Diagnóstico estratégico e consultoria IA
│   │   ├── DashboardView.tsx         # Visão geral do patrimônio e métricas
│   │   ├── Header.tsx                # Barra superior com status de sincronização
│   │   ├── NewTransactionModal.tsx   # Modal de inserção manual de lançamentos
│   │   ├── OpenFinanceView.tsx       # Gestão de conexões bancárias e sincronização
│   │   ├── PluggyConnectModal.tsx    # Modal de autenticação Open Finance / MeuPluggy
│   │   ├── Sidebar.tsx               # Navegação lateral persistente
│   │   └── TransactionsView.tsx      # Tabela analítica de movimentações
│   ├── db/
│   │   ├── index.ts                  # Conexão LibSQL e inicialização de tabelas
│   │   └── schema.ts                 # Esquema relacional Drizzle ORM
│   └── lib/
│       ├── ai/
│       │   ├── gemini-client.ts      # Integração com Google Gemini Flash Lite
│       │   ├── math-engine.ts        # Cálculos determinísticos locais (0 tokens)
│       │   └── snapshot-compressor.ts# Compressor de métricas para < 180 tokens
│       └── pluggy.ts                 # Cliente da API v2 da Pluggy
├── .env.example                      # Modelo de variáveis de ambiente
├── package.json                      # Dependências do projeto
├── pnpm-lock.yaml                    # Lockfile reprodutível do pnpm
└── README.md                         # Este documento
```

---

## 7. Como Executar Localmente

### Pré-requisitos
- **Node.js** v20+ instalado;
- **pnpm** instalado (`npm install -g pnpm`);
- Chaves de API:
  - Chaves de Desenvolvedor da **[Pluggy](https://dashboard.pluggy.ai)** (`PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`);
  - Chave de API do **[Google AI Studio](https://aistudio.google.com/)** (`GEMINI_API_KEY`).

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
   Crie o arquivo `.env.local` na raiz com base no `.env.example`:
   ```bash
   cp .env.example .env.local
   ```
   Preencha os campos com suas credenciais:
   ```env
   PLUGGY_CLIENT_ID=seu_client_id_uuid
   PLUGGY_CLIENT_SECRET=seu_client_secret
   PLUGGY_BASE_URL=https://api.pluggy.ai

   GEMINI_API_KEY=sua_gemini_api_key
   ```

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   pnpm run dev
   ```

5. **Acesse a aplicação:**
   Abra [http://localhost:3000](http://localhost:3000) no seu navegador. O banco de dados local SQLite (`finai.db`) será inicializado automaticamente na primeira execução com a taxonomia de categorias do sistema.

---

## 8. Segurança e Privacidade de Dados Financeiros

- **Sem Armazenamento de Senhas:** Nenhuma credencial bancária passa pelos servidores da aplicação; toda a autenticação é gerida sob o padrão regulatório do Open Finance Brasil pela Pluggy.
- **Banco de Dados Local Primeiro:** As transações, saldos e históricos ficam armazenados em arquivo SQLite local (`finai.db`), que por padrão é ignorado no `.gitignore` e nunca é enviado para repositórios remotos.
- **Privacidade da IA:** O modelo de IA nunca recebe dados pessoais identificáveis (CPF, números de agência ou número de conta). Apenas o vetor sintético de métricas agregadas (totais e desvios) é transmitido para diagnóstico.

---

## 9. Licença

Este projeto é disponibilizado sob a licença [MIT](LICENSE).
