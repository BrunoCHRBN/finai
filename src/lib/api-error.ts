import { NextResponse } from 'next/server';

/**
 * Redacts sensitive tokens, API keys, credentials, and internal filesystem paths
 * from error messages and log outputs.
 */
export function redactSensitive(input: unknown): string {
  if (input === null || input === undefined) return '';
  const msg = typeof input === 'string' ? input : input instanceof Error ? `${input.message}\n${input.stack || ''}` : String(input);

  return msg
    // Redact JWTs and long random tokens/hashes (24+ alphanumeric chars)
    .replace(/[a-zA-Z0-9_\-]{24,}/g, '[REDACTED_TOKEN]')
    // Redact key-value credentials (secrets, api keys, auth headers, passwords)
    .replace(
      /(client[_\s-]?secret|api[_\s-]?key|authorization|bearer|token|password|passwd|auth_token)[=:\s]+[^\s,]+/gi,
      '$1=[REDACTED]'
    )
    // Redact connection strings (e.g., file:/path/to or postgresql://user:pass@host)
    .replace(/(file:|libsql:|postgres:|postgresql:|mysql:)\/{1,3}[^\s,)]+/gi, '[REDACTED_DATABASE_URL]')
    // Redact local user directory paths (e.g. /home/username/... or C:\Users\username\...)
    .replace(/(\/(?:home|Users)\/)[^/\s]+/g, '$1[USER]');
}

/**
 * Standardizes API HTTP 500 error responses:
 * - Logs technical details and stack traces ONLY on the server, with redaction.
 * - Returns a generic, safe message to the client, preventing any schema, path, or credential leakage.
 * - Transparently rethrows Next.js internal prerender / redirection signals.
 */
export function handleApiError(
  error: unknown,
  clientMessage = 'Ocorreu um erro interno ao processar a solicitação.',
  logContext = 'API Endpoint'
): NextResponse {
  // Rethrow Next.js internal control flow interruptions
  if (
    error &&
    typeof error === 'object' &&
    'digest' in error &&
    typeof (error as { digest: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_')
  ) {
    throw error;
  }

  // Redact before logging on the server
  const rawDetails = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const safeLog = redactSensitive(rawDetails);
  console.error(`[${logContext}] Internal Server Error:`, safeLog);

  // Return generic client error with HTTP 500
  return NextResponse.json(
    { error: clientMessage },
    { status: 500 }
  );
}
