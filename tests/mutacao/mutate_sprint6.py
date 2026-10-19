#!/usr/bin/env python3
"""
Harness de mutacao do FinAI — Sprint 6.

Reintroduz, uma por vez, defeitos plausiveis nas regras financeiras,
de seguranca e de resiliencia do codigo de PRODUCAO, e exige que a suite
de testes FALHE. Uma mutacao que deixa a suite verde denuncia uma
afirmacao que NAO esta protegida por teste.

Cada mutacao:
  1. Aplica uma substituicao textual exata (ancora deve casar 1x).
  2. Roda `node --test tests/*.test.ts`.
  3. Restaura o arquivo a partir do git e confirma que ficou limpo.

Uso:
  python3 tests/mutacao/mutate_sprint6.py            # roda todas
  python3 tests/mutacao/mutate_sprint6.py --list     # so lista
"""
import os
import re
import subprocess
import sys

ROOT = "/home/bruno-vsantos/Projetos/finai"

# (id, arquivo, ancora_exata, substituto, regra_protegida)
MUTATIONS = [
    (
        "M01-transfer-counted-as-operating",
        "src/lib/ai/math-engine.ts",
        "if (rawType === 'TRANSFER' || isInvoicePaymentDescription(tx.description)) {",
        "if (isInvoicePaymentDescription(tx.description)) {",
        "Transferencia propria nao pode entrar em receita/despesa operacional",
    ),
    (
        "M02-refund-handling-disabled",
        "src/lib/ai/math-engine.ts",
        "    if (isRefund) {",
        "    if (false) {",
        "Estorno de compra deve abater despesa sem inflar receita",
    ),
    (
        "M03-invoice-payment-never-detected",
        "src/lib/transactions.ts",
        "  const desc = description.toUpperCase();",
        "  const desc = '';",
        "Pagamento de fatura deve ser reconhecido para evitar dupla contagem",
    ),
    (
        "M04-self-transfer-reconciliation-disabled",
        "src/lib/transactions.ts",
        "      if (diffDays <= 1.5) {",
        "      if (false) {",
        "Reconciliacao automatica de transferencias entre contas proprias",
    ),
    (
        "M05-credit-card-debt-zeroed",
        "src/lib/patrimony-engine.ts",
        "      const cardDebt = Math.max(0, rawBalance);",
        "      const cardDebt = 0;",
        "Fatura de cartao deve compor o passivo patrimonial",
    ),
    (
        "M06-fingerprint-ignores-state-digest",
        "src/lib/ai/snapshot-compressor.ts",
        "      parts.stateDigest || ''",
        "      ''",
        "Fingerprint deve mudar quando o estado financeiro muda (invalida cache)",
    ),
    (
        "M07-prompt-injection-patterns-disabled",
        "src/lib/ai/snapshot-compressor.ts",
        "  for (const pattern of PROMPT_INJECTION_PATTERNS) {",
        "  for (const pattern of []) {",
        "Sanitizacao deve neutralizar instrucoes maliciosas em texto nao confiavel",
    ),
    (
        "M08-sensitive-value-patterns-disabled",
        "src/lib/ai/snapshot-compressor.ts",
        "  for (const pattern of SENSITIVE_VALUE_PATTERNS) {",
        "  for (const pattern of []) {",
        "Sanitizacao deve remover CPF/CNPJ, cartao e tokens",
    ),
    (
        "M09-auth-error-becomes-retryable",
        "src/lib/ai/gemini-client.ts",
        "      category: 'AUTH_CONFIG_ERROR',\n      statusCode: status || 401,\n      isRetryable: false,\n      isFallbackEligible: false,",
        "      category: 'AUTH_CONFIG_ERROR',\n      statusCode: status || 401,\n      isRetryable: true,\n      isFallbackEligible: true,",
        "Erro 401/403 nao pode disparar retry nem fallback secundario",
    ),
    (
        "M10-round-currency-disabled",
        "src/lib/planning-engine.ts",
        "  return Math.round((value + Number.EPSILON) * 100) / 100;",
        "  return value;",
        "Arredondamento a centavo deve eliminar deriva IEEE-754",
    ),
    (
        "M11-aborted-stream-reported-as-complete",
        "src/app/api/ai/chat/route.ts",
        "            if (request.signal.aborted) {\n              sendEvent('aborted', {",
        "            if (false) {\n              sendEvent('aborted', {",
        "Stream cancelado pelo cliente nao pode ser reportado como completo",
    ),
    (
        "M12-client-abort-treated-as-server-error",
        "src/app/api/ai/chat/route.ts",
        "            const isClientAbort =\n              request.signal.aborted ||\n              errCode === 'ABORTED_BY_CLIENT' ||\n              errName === 'ClientAbortError';",
        "            const isClientAbort = false;",
        "Cancelamento do cliente nao pode ser classificado como erro do servidor",
    ),
    (
        "M13-message-validation-removed",
        "src/app/api/ai/chat/route.ts",
        "    if (!body || typeof body.message !== 'string' || !body.message.trim()) {",
        "    if (false) {",
        "Endpoint deve rejeitar corpo sem `message` valido (HTTP 400)",
    ),
]


def run_suite():
    """Roda a suite (com o loader de alias) e devolve (exit_code, pass, fail)."""
    r = subprocess.run(
        ["node", "--test", "--import", "./tests/alias-register.mjs", "tests/*.test.ts"],
        cwd=ROOT, capture_output=True, text=True,
    )
    out = r.stdout + r.stderr
    m_pass = re.search(r"^# pass (\d+)$", out, re.M) or re.search(r"ℹ pass (\d+)", out)
    m_fail = re.search(r"^# fail (\d+)$", out, re.M) or re.search(r"ℹ fail (\d+)", out)
    return r.returncode, (int(m_pass.group(1)) if m_pass else -1), (int(m_fail.group(1)) if m_fail else -1)


def git_clean(path):
    return subprocess.run(["git", "diff", "--quiet", "--", path], cwd=ROOT).returncode == 0


def write_exact(path, content):
    with open(os.path.join(ROOT, path), "w", encoding="utf-8") as f:
        f.write(content)


def read_exact(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def restore(path, original):
    """Restaura pelo conteudo salvo em memoria — NUNCA por `git checkout`.

    `git checkout -- <arquivo>` reverte para o HEAD e apaga alteracoes ainda
    nao commitadas do proprio sprint. Foi o que aconteceu na primeira versao
    deste harness: a correcao do SSE na rota foi destruida silenciosamente
    quando a mutacao seguinte restaurou o arquivo.
    """
    write_exact(path, original)
    if read_exact(path) != original:
        raise RuntimeError(f"restauracao divergente em {path}")


def main():
    if "--list" in sys.argv:
        for mid, path, _a, _s, rule in MUTATIONS:
            print(f"{mid:44s} {path:42s} {rule}")
        return 0

    base_code, base_pass, base_fail = run_suite()
    print(f"BASELINE: exit={base_code} pass={base_pass} fail={base_fail}\n")
    if base_code != 0:
        print("ABORTADO: baseline nao esta verde. Nao da para medir discriminacao.")
        return 1

    results = []
    for mid, path, anchor, sub, rule in MUTATIONS:
        original = read_exact(path)

        n = original.count(anchor)
        if n != 1:
            results.append((mid, path, "ANCORA_AMBIGUA", f"{n} ocorrencias", rule))
            print(f"[{mid}] ANCORA AMBIGUA ({n}x) — pulando")
            continue

        write_exact(path, original.replace(anchor, sub, 1))

        try:
            code, npass, nfail = run_suite()
        finally:
            restore(path, original)

        detected = code != 0 and nfail > 0
        verdict = "DETECTADO" if detected else "NAO DETECTADO"
        results.append((mid, path, verdict, f"exit={code} fail={nfail}", rule))
        print(f"[{mid}] {verdict}  (exit={code}, fail={nfail}, pass={npass})")

    print("\n=== RESUMO ===")
    detectados = sum(1 for r in results if r[2] == "DETECTADO")
    nao = [r for r in results if r[2] != "DETECTADO"]
    for mid, path, verdict, info, rule in results:
        print(f"{verdict:15s} {mid:44s} {info}")
    print(f"\n{detectados}/{len(results)} mutacoes detectadas pela suite.")

    if nao:
        print("\nAFIRMACOES NAO PROTEGIDAS (mutacao sobreviveu):")
        for mid, path, verdict, info, rule in nao:
            print(f"  - {mid}: {rule}  [{path}] {info}")
        return 1

    print("\nTodas as regras testadas estao protegidas por teste que discrimina.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
