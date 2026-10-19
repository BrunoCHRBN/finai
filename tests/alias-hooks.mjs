// Hooks de resolucao para `node --test`, que permitem testar as ROTAS de API
// reais (e nao apenas as bibliotecas):
//   1. Alias "@/..." (tsconfig paths) -> ./src/...
//   2. Subpath "next/server" -> "next/server.js"
//   3. Fallback de extensao (.ts/.tsx/index.ts) para imports relativos e alias,
//      que o bundler do Next resolve mas o resolver do Node nao.
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const ALIAS_PREFIX = '@' + '/';

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function firstExisting(url) {
  const p = fileURLToPath(url);
  const candidates = [p, p + '.ts', p + '.tsx', p + '/index.ts', p + '/index.tsx'];
  for (const cand of candidates) {
    if (isFile(cand)) return pathToFileURL(cand).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context);
  }

  if (specifier.startsWith(ALIAS_PREFIX)) {
    const hit = firstExisting(new URL('src/' + specifier.slice(ALIAS_PREFIX.length), ROOT));
    if (hit) return { url: hit, shortCircuit: true };
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (context.parentURL) {
      const hit = firstExisting(new URL(specifier, context.parentURL));
      if (hit) return { url: hit, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
