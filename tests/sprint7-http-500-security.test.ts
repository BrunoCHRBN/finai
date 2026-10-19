import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitive, handleApiError } from '../src/lib/api-error.ts';

describe('Sprint 7 — Fase 0.3: Padronização de erros HTTP 500 e Redação de Segredos', () => {
  it('redactSensitive redige tokens longos, chaves de API e segredos', () => {
    const rawError = 'Error with key AIzaSyD4j19XkL89_secretToken123456789 and Bearer abcdef1234567890abcdef123456';
    const sanitized = redactSensitive(rawError);

    assert.ok(!sanitized.includes('AIzaSyD4j19XkL89_secretToken123456789'), 'token não deve vazar');
    assert.ok(!sanitized.includes('abcdef1234567890abcdef123456'), 'bearer token não deve vazar');
    assert.ok(sanitized.includes('[REDACTED_TOKEN]'), 'deve conter substituição segura');
  });

  it('redactSensitive redige caminhos de arquivos de usuários e URLs de banco', () => {
    const rawError = 'SQLITE_ERROR: error at /home/bruno-vsantos/Projetos/finai/finai.db (DATABASE_URL=file:/home/bruno-vsantos/finai.db)';
    const sanitized = redactSensitive(rawError);

    assert.ok(!sanitized.includes('bruno-vsantos'), 'username não deve vazar');
    assert.ok(sanitized.includes('/home/[USER]'), 'deve substituir diretório de usuário por [USER]');
    assert.ok(sanitized.includes('[REDACTED_DATABASE_URL]'), 'deve redigir URL do banco');
  });

  it('handleApiError retorna HTTP 500 com mensagem genérica e não vaza detalhes técnicos', async () => {
    const technicalError = new Error('SQLITE_ERROR: no such table: internal_secret_table at /home/bruno-vsantos/db.ts:42');
    const response = handleApiError(technicalError, 'Falha ao processar operação.', 'testContext');

    assert.strictEqual(response.status, 500);
    const body = await response.json();
    assert.strictEqual(body.error, 'Falha ao processar operação.');
    assert.strictEqual(body.details, undefined, 'campo details nunca deve existir no corpo JSON para o cliente');
    assert.ok(!JSON.stringify(body).includes('SQLITE_ERROR'), 'detalhe técnico não deve vazar no corpo JSON');
    assert.ok(!JSON.stringify(body).includes('internal_secret_table'), 'nome de tabela não deve vazar');
    assert.ok(!JSON.stringify(body).includes('bruno-vsantos'), 'caminho de arquivo não deve vazar');
  });

  it('handleApiError com objeto de erro não-Error ou string retorna mensagem padrão segura sem expor stack', async () => {
    const rawObj = { code: 'ECONNREFUSED', address: '127.0.0.1', port: 5432 };
    const response = handleApiError(rawObj, undefined, 'testContext');

    assert.strictEqual(response.status, 500);
    const body = await response.json();
    assert.strictEqual(body.error, 'Ocorreu um erro interno ao processar a solicitação.');
    assert.strictEqual(body.details, undefined);
    assert.ok(!JSON.stringify(body).includes('127.0.0.1'));
  });

  it('handleApiError preserva o fluxo de controle interno do Next.js (prerender interruption)', () => {
    const prerenderError = { digest: 'NEXT_PRERENDER_INTERRUPTED' };
    assert.throws(
      () => handleApiError(prerenderError),
      (err: unknown) => typeof err === 'object' && err !== null && (err as { digest?: string }).digest === 'NEXT_PRERENDER_INTERRUPTED',
      'deve re-lançar o erro de controle do Next.js'
    );
  });
});

