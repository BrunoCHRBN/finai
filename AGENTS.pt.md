# Diretrizes para Agentes de IA — FinAI

<p align="center">
  <a href="AGENTS.md"><strong>English Version</strong></a> •
  <a href="AGENTS.pt.md"><strong>Versão em Português</strong></a>
</p>

## Next.js e Arquitetura do Repositório

Esta versão do Next.js (16.4+) possui alterações estruturais em relação a versões anteriores: APIs, convenções e estrutura de pastas podem divergir de bases de treino antigas.

Consulte os guias em `node_modules/next/dist/docs/` antes de realizar alterações nas rotas e componentes. Atente-se aos avisos de depreciação e siga as regras canônicas do projeto:

1. **Motores Determinísticos Locais:** Nunca substitua cálculos financeiros locais por chamadas ou prompts de IA. Cálculos de balanço, receitas, despesas, conciliação e projeções devem permanecer determinísticos em `src/lib/`.
2. **Preservação de Dados:** Nunca apague, recrie ou sobrescreva o arquivo `finai.db` do usuário. Migrações devem ser sempre incrementais e não destrutivas via `PRAGMA table_info` em `src/db/index.ts`.
3. **Segurança de Segredos:** Nunca exponha chaves de API (`GEMINI_API_KEY`, `PLUGGY_*`, `BRAPI_*`) no cliente ou em respostas HTTP. Utilize sempre `handleApiError` para sanitizar respostas HTTP 500.
4. **Convenções de Código:** TypeScript estrito com Next.js App Router, Tailwind CSS e componentes React 19.
