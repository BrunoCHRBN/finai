import { GoogleGenAI } from '@google/genai';
import { SyntheticFinancialSnapshot } from './snapshot-compressor';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export interface AIDiagnosisResult {
  status: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL';
  headline: string;
  summary: string;
  priorityActions: Array<{
    title: string;
    impact: string; // e.g., "Economia estimada: R$ 400/mês"
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

  const systemInstruction = `Você é o FinAI Engine, um mentor financeiro quantitativo de elite.
Sua missão: fornecer diagnósticos cirúrgicos, diretos e ultra-otimizados em tokens para usuários no Brasil.
Regras:
1. Responda estritamente em formato JSON válido.
2. Seja conciso: zero enrolação, zero introduções genéricas.
3. Adapte a linguagem ao Nível de Maturidade:
   - Nível 1: Foco em corte imediato de vazamentos, juros e criação de 1 mês de reserva.
   - Nível 2: Foco em completar reserva de emergência (6 meses) e manter taxa de poupança > 20%.
   - Nível 3: Foco em aportes consistentes, custo de oportunidade e diversificação.
   - Nível 4: Foco em alocação de ativos, eficiência fiscal e renda passiva.`;

  const userPrompt = `Analise este snapshot financeiro ultracompacto:
${JSON.stringify(snapshot)}

Retorne um JSON exatamente com esta estrutura:
{
  "status": "OPTIMAL" | "ATTENTION" | "CRITICAL",
  "headline": "Título curto de 4 a 8 palavras",
  "summary": "Resumo de 2 a 3 frases densas com a sua avaliação quantitativa do momento.",
  "priorityActions": [
    { "title": "Ação específica", "impact": "Impacto em R$ ou meses de runway", "category": "Categoria" }
  ],
  "nextMilestone": "A próxima conquista chave para avançar de nível"
}`;

  if (!GEMINI_API_KEY) {
    return generateFallbackDiagnosis(snapshot, 'Sem chave GEMINI_API_KEY configurada');
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
      // Clean possible markdown code fences (```json ... ```)
      const cleanJson = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();

      const parsed = JSON.parse(cleanJson);
      
      const totalTokens = response.usageMetadata?.totalTokenCount || 240;

      return {
        status: parsed.status || 'ATTENTION',
        headline: parsed.headline || 'Diagnóstico Financeiro do Mês',
        summary: parsed.summary || 'Análise consolidada baseada nas suas despesas e receitas.',
        priorityActions: parsed.priorityActions || [],
        nextMilestone: parsed.nextMilestone || 'Consolidar reserva de emergência.',
        tokensConsumed: totalTokens,
        modelUsed: modelName,
      };
    } catch (err: any) {
      console.warn(`Gemini model ${modelName} error:`, err.message || err);
      // Try next model in loop
    }
  }

  // If all live models failed (e.g. temporary network error or quota), return deterministic fallback
  return generateFallbackDiagnosis(snapshot, 'Fallback determinístico local ativado');
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
      title: `Reduzir gastos em ${overbudgetCategory.cat}`,
      impact: `Economia de até R$ ${(overbudgetCategory.spent - overbudgetCategory.budget).toFixed(2)}`,
      category: overbudgetCategory.cat,
    });
  }

  priorityActions.push({
    title: 'Automatizar aporte no primeiro dia útil',
    impact: `Garantir meta de R$ ${(snapshot.kpis.income * 0.2).toFixed(2)}/mês`,
    category: 'Aportes',
  });

  return {
    status,
    headline: `Diagnóstico Nível ${snapshot.level}: Foco em ${snapshot.level <= 2 ? 'Segurança e Reserva' : 'Acúmulo e Aportes'}`,
    summary: `Taxa de poupança em ${snapshot.kpis.savings_rate}% com runway de ${snapshot.kpis.runway_m} meses de custos fixos. ${reason}.`,
    priorityActions,
    nextMilestone: snapshot.level === 1 ? 'Completar 1 mês de custos em reserva' : 'Atingir 6 meses de runway líquido',
    tokensConsumed: 0,
    modelUsed: 'deterministic-fallback (0 tokens)',
  };
}
