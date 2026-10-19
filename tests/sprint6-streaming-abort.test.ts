/**
 * Sprint 6 — Fase 4.3, caso "aborto DURANTE a chamada ao provedor".
 *
 * Arquivo separado de proposito: `gemini-client` le `GEMINI_API_KEY` no
 * carregamento do modulo. Aqui a chave e definida (valor ficticio, nunca usado
 * em rede) ANTES de importar a rota, para que o caminho de execucao chegue ao
 * `catch` com `ABORTED_BY_CLIENT`.
 *
 * Por que isso importa: com o cliente desconectando antes da chamada,
 * `invokeModelWithTimeout` lanca `ABORTED_BY_CLIENT` imediatamente — sem
 * tocar a rede. E esse o unico caminho deterministico que exercita a
 * classificacao de cancelamento no `catch` da rota.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const TEST_DB = path.join(os.tmpdir(), `finai-sprint6-abort-${process.pid}.db`);
process.env.DATABASE_URL = `file:${TEST_DB}`;
process.env.GEMINI_API_KEY = 'AIzaDummyKeyNeverUsedOnNetwork123456';

const { NextRequest } = await import('next/server');
const chatRoute = await import('../src/app/api/ai/chat/route.ts');

async function collectSse(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ event: string; data: unknown }> = [];
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const ev = /^event: (.+)$/m.exec(frame);
      const dt = /^data: (.+)$/m.exec(frame);
      if (ev) events.push({ event: ev[1].trim(), data: dt ? JSON.parse(dt[1]) : null });
      sep = buffer.indexOf('\n\n');
    }
  }
  return events;
}

describe('Sprint 6 — Cancelamento durante a chamada ao provedor', () => {
  it('cancelamento no meio da chamada vira `aborted`, nunca `error`', async () => {
    const controller = new AbortController();
    controller.abort();

    const res = await chatRoute.POST(
      new NextRequest('http://localhost:3000/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({
          message: 'Faça um diagnóstico completo da minha situação financeira',
          stream: true,
        }),
        signal: controller.signal,
      })
    );

    const events = await collectSse(res);
    const names = events.map((e) => e.event);

    assert.ok(
      !names.includes('error'),
      'cancelamento do cliente não pode ser classificado como erro do servidor'
    );
    assert.ok(!names.includes('complete'), 'stream cancelado não é stream completo');
    assert.strictEqual(
      names[names.length - 1],
      'aborted',
      'o evento terminal deve ser `aborted`'
    );
    assert.strictEqual(events[events.length - 1].data.success, false);
  });
});
