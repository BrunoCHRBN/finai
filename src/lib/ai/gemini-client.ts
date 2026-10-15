import { GoogleGenAI } from '@google/genai';
import { SyntheticFinancialSnapshot } from './snapshot-compressor';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export interface AIDiagnosisResult {
  status: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL';
  headline: string;
  summary: string;
  priorityActions: Array<{
    title: string;
    impact: string;
    category: string;
  }>;
  nextMilestone: string;
  tokensConsumed: number;
  modelUsed: string;
}

export async function generateFinancialDiagnosis(
  snapshot: SyntheticFinancialSnapshot
): Promise<AIDiagnosisResult> {
  const modelsToTry = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];

  // Directives embedding Anti-AI-Slop Writing Directive v2
  const systemInstruction = `Escreva como um analista financeiro experiente e pragmático.
Evite qualquer clichê corporativo, floreio motivacional ou tom professoral.
Regras estritas de redação:
- Proibido usar: "jornada", "crucial", "vital", "robusto", "alavancar", "potencializar", "desbloquear", "mergulhar", "ecossistema", "transformador".
- Nada de tapinhas nas costas ou elogios vazios; aponte o que os números mostram sem rodeios.
- Nunca padronize em 3 itens (regra dos três). Retorne uma, duas ou quatro ações, dependendo estritamente do que o orçamento pede.
- Varie o tamanho das frases: intercale sentenças curtas e diretas com períodos mais longos articulados por ponto e vírgula ou conjunções; evite parataxe repetitiva.
- Use pontuação humana: zero pontos de exclamação, no máximo um travessão por diagnóstico, prefira ponto e vírgula para contrastar causas e efeitos.
- Cite valores exatos em reais e prazos reais contidos nos dados.
- Responda apenas em JSON válido.`;

  const userPrompt = `Analise este extrato sintético:
${JSON.stringify(snapshot)}

Formate o resultado rigorosamente neste schema JSON:
{
  "status": "OPTIMAL" | "ATTENTION" | "CRITICAL",
  "headline": "Frase curta de 4 a 8 palavras, sem ponto de exclamação",
  "summary": "Dois parágrafos curtos ou três frases conectadas avaliando a liquidez real, o burn rate e a capacidade de suportar imprevistos.",
  "priorityActions": [
    { "title": "Ação imediata com números reais", "impact": "Resultado em R$ ou meses de runway", "category": "Categoria" }
  ],
  "nextMilestone": "Próximo passo palpável para o nível atual"
}`;

  if (!GEMINI_API_KEY) {
    return generateFallbackDiagnosis(snapshot, 'motor local offline');
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }] },
        ],
      });

      const rawText = response.text || '';
      const cleanJson = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();

      const parsed = JSON.parse(cleanJson);
      const totalTokens = response.usageMetadata?.totalTokenCount || 230;

      // Enforce anti-rule-of-three sanity check: if model returned exactly 3, keep 2 or slice
      let actions = parsed.priorityActions || [];
      if (actions.length === 3) {
        actions = actions.slice(0, 2);
      }

      return {
        status: parsed.status || 'ATTENTION',
        headline: (parsed.headline || 'Diagnóstico do Mês').replace(/!/g, ''),
        summary: (parsed.summary || 'Liquidez atual preservada.').replace(/!/g, ''),
        priorityActions: actions,
        nextMilestone: (parsed.nextMilestone || 'Garantir colchão financeiro').replace(/!/g, ''),
        tokensConsumed: totalTokens,
        modelUsed: modelName,
      };
    } catch (err: any) {
      console.warn(`Tentativa com ${modelName} falhou:`, err.message || err);
    }
  }

  return generateFallbackDiagnosis(snapshot, 'cálculo determinístico local');
}

function generateFallbackDiagnosis(
  snapshot: SyntheticFinancialSnapshot,
  reason: string
): AIDiagnosisResult {
  const isHealthy = snapshot.kpis.savings_rate >= 20 && snapshot.kpis.runway_m >= 3;
  const status = isHealthy ? 'OPTIMAL' : snapshot.kpis.runway_m < 1 ? 'CRITICAL' : 'ATTENTION';

  const overbudgetCategory = snapshot.top_deviations[0];
  const priorityActions = [];

  if (overbudgetCategory) {
    priorityActions.push({
      title: `Travar despesas em ${overbudgetCategory.cat}`,
      impact: `Corte de R$ ${(overbudgetCategory.spent - overbudgetCategory.budget).toFixed(2)} acumulados acima do combinado`,
      category: overbudgetCategory.cat,
    });
  }

  priorityActions.push({
    title: 'Separar aporte no primeiro dia útil',
    impact: `Garante R$ ${(snapshot.kpis.income * 0.2).toFixed(2)} antes que o dinheiro se perca no dia a dia`,
    category: 'Aportes',
  });

  return {
    status,
    headline: `Nível ${snapshot.level}: ${snapshot.level <= 2 ? 'Formação de colchão financeiro' : 'Consistência de caixa e alocação'}`,
    summary: `A poupança fechou em ${snapshot.kpis.savings_rate}%, garantindo ${snapshot.kpis.runway_m} meses de custo fixo coberto; desvios no estilo de vida continuam sendo o principal ponto de atrito (${reason}).`,
    priorityActions,
    nextMilestone: snapshot.level === 1 ? 'Primeiro mês de despesas fixas em conta remunerada' : 'Seis meses de despesas cobertas em liquidez diária',
    tokensConsumed: 0,
    modelUsed: 'motor-local (0 tokens)',
  };
}
