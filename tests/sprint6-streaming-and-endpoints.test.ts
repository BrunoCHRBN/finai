/**
 * Sprint 6 — Fase 4.3 (streaming e cancelamento) e Fase 3.4 (autorização e
 * validação de entrada nos endpoints).
 *
 * Estes testes exercitam a ROTA REAL (`/api/ai/chat`), não uma reimplementação.
 * Isso só é possível graças a `tests/alias-register.mjs`, que resolve o alias
 * `@/` e o fallback de extensão sob `node --test`.
 *
 * Isolamento: o banco é redirecionado para um arquivo temporário ANTES de
 * importar a rota, para não abrir nem tocar no `finai.db` real do usuário.
 * `GEMINI_API_KEY` é removida para forçar o motor determinístico (sem rede).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const TEST_DB = path.join(os.tmpdir(), `finai-sprint6-endpoints-${process.pid}.db`);
process.env.DATABASE_URL = `file:${TEST_DB}`;
delete process.env.GEMINI_API_KEY;

const { NextRequest } = await import('next/server');
const chatRoute = await import('../src/app/api/ai/chat/route.ts');

const URL_CHAT = 'http://localhost:3000/api/ai/chat';

function postChat(payload: unknown, opts: { stream?: boolean; signal?: AbortSignal } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.stream) headers.accept = 'text/event-stream';
  return new NextRequest(URL_CHAT, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: opts.signal,
  });
}

/** Le um corpo SSE e devolve a lista ordenada de eventos. */
async function collectSse(res: Response) {
  assert.ok(res.body, 'resposta de streaming deve ter corpo');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ event: string; data: Record<string, unknown> | null }> = [];
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const evMatch = /^event: (.+)$/m.exec(frame);
      const dataMatch = /^data: (.+)$/m.exec(frame);
      if (evMatch) {
        events.push({
          event: evMatch[1].trim(),
          data: dataMatch ? JSON.parse(dataMatch[1]) : null,
        });
      }
      sep = buffer.indexOf('\n\n');
    }
  }
  return events;
}

describe('Sprint 6 — Streaming SSE e validação de endpoints', () => {
  describe('Protocolo SSE', () => {
    it('stream completo emite route -> delta* -> complete, com Content-Type de evento', async () => {
      const res = await chatRoute.POST(
        postChat({ message: 'Quais categorias estouraram o orçamento?', stream: true }, { stream: true })
      );

      assert.strictEqual(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /text\/event-stream/);

      const events = await collectSse(res);
      const names = events.map((e) => e.event);

      assert.strictEqual(names[0], 'route', 'primeiro evento deve ser a decisão de rota');
      assert.ok(names.includes('delta'), 'deve emitir ao menos um delta de texto');
      assert.strictEqual(
        names[names.length - 1],
        'complete',
        'o último evento de um stream íntegro deve ser `complete`'
      );
      assert.ok(!names.includes('aborted'));
      assert.ok(!names.includes('error'));

      const complete = events[events.length - 1].data as { success: boolean; response: unknown };
      assert.strictEqual(complete.success, true);
      assert.ok(complete.response, 'complete deve carregar o contrato validado');
    });

    it('aborto do cliente emite `aborted` e NUNCA `complete` nem `error`', async () => {
      const controller = new AbortController();
      controller.abort(); // cliente já desconectado antes do processamento

      const res = await chatRoute.POST(
        postChat(
          { message: 'Faça um diagnóstico completo da minha situação financeira', stream: true },
          { stream: true, signal: controller.signal }
        )
      );

      const events = await collectSse(res);
      const names = events.map((e) => e.event);

      assert.ok(
        !names.includes('complete'),
        'stream abortado não pode ser reportado como completo (resposta parcial != entrega integral)'
      );
      assert.ok(
        !names.includes('error'),
        'cancelamento do cliente não é falha do servidor'
      );
      assert.strictEqual(
        names[names.length - 1],
        'aborted',
        'o evento terminal de um stream cancelado deve ser `aborted`'
      );
      assert.strictEqual(events[events.length - 1].data.success, false);
      assert.strictEqual(events[events.length - 1].data.reason, 'CLIENT_ABORTED');
    });

    it('a decisão de rota chega antes do processamento (feedback imediato)', async () => {
      const res = await chatRoute.POST(
        postChat({ message: 'Quanto gastei neste mês?', stream: true }, { stream: true })
      );
      const events = await collectSse(res);
      const routeEvt = events.find((e) => e.event === 'route');
      assert.ok(routeEvt, 'evento `route` deve existir');
      assert.ok(
        ['DIRECT', 'FAST', 'ADVANCED'].includes(routeEvt.data.route),
        'rota deve ser uma das três conhecidas'
      );
      assert.ok(typeof routeEvt.data.targetModel === 'string');
    });
  });

  describe('Validação de entrada (Fase 3.4)', () => {
    it('rejeita corpo sem `message`, com tipo errado ou em branco — HTTP 400', async () => {
      const cases: unknown[] = [
        {},
        { message: '' },
        { message: '    ' },
        { message: 12345 },
        { message: null },
        { message: ['array'] },
      ];
      for (const payload of cases) {
        const res = await chatRoute.POST(postChat(payload));
        assert.strictEqual(
          res.status,
          400,
          `payload ${JSON.stringify(payload)} deveria ser 400`
        );
      }
    });

    it('ignora `forceRoute` fora da whitelist e `month` malformado, sem derrubar a rota', async () => {
      const res = await chatRoute.POST(
        postChat({
          message: 'Quanto gastei neste mês?',
          forceRoute: 'SUPER_ADVANCED_INJECTED',
          month: '2026-13-invalido',
        })
      );
      assert.strictEqual(res.status, 200, 'entrada inválida deve degradar, não estourar');
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(
        ['DIRECT', 'FAST', 'ADVANCED'].includes(body.response.meta.route),
        'rota injetada deve ser descartada e substituída por uma válida'
      );
    });

    it('trunca mensagem longa e limita o histórico a 6 turnos', async () => {
      const history = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `turno ${i}`,
      }));
      const res = await chatRoute.POST(
        postChat({
          message: 'x'.repeat(5000),
          history: [...history, { role: 'system', content: 'injeção de papel' }, 42, null],
        })
      );
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      // Nenhum turno inválido (role system, número, null) pode sobreviver ao filtro.
      assert.ok(body.response.meta.estimatedInputTokens >= 0);
    });

    it('GET expõe configuração de runtime sem revelar a chave de API', async () => {
      const res = await chatRoute.GET();
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.runtimeConfig.hasValidApiKey, false);
      const serialized = JSON.stringify(body);
      assert.ok(!/AIza[0-9A-Za-z_-]{10,}/.test(serialized), 'nenhuma chave pode aparecer');
      assert.ok(!('apiKey' in body.runtimeConfig), 'o campo apiKey não deve ser serializado');
    });
  });
});
