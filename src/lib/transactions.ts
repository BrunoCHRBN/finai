/**
 * FinAI Canonical Transaction Classification & Normalization
 *
 * Single Internal Convention:
 * - CREDIT: Inflow / Income / Salário / Depósito / Reembolso.
 *   Canonical Amount: ALWAYS POSITIVE (+Math.abs(amount)).
 * - DEBIT: Outflow / Expense / Compra / Pagamento / Tarifa.
 *   Canonical Amount: ALWAYS NEGATIVE (-Math.abs(amount)).
 */

export type TransactionType = 'CREDIT' | 'DEBIT';

export interface RawTransactionInput {
  amount: number | string | null | undefined;
  type?: string | null;
}

export interface NormalizedTransactionValues {
  amount: number;
  type: TransactionType;
}

/**
 * Normalizes any transaction values into FinAI canonical convention.
 *
 * Handles:
 * - Credit card purchases returned by Open Finance with positive amounts but type 'DEBIT'.
 * - Refunds or deposits with negative or positive signs.
 * - String amounts with comma or period decimal separators.
 * - Null, undefined, or NaN amounts (coerced safely to 0).
 */
export function normalizeTransactionValues(input: RawTransactionInput): NormalizedTransactionValues {
  let num = 0;
  if (typeof input.amount === 'number') {
    num = isNaN(input.amount) ? 0 : input.amount;
  } else if (typeof input.amount === 'string') {
    const cleaned = input.amount.trim().replace(',', '.');
    const parsed = parseFloat(cleaned);
    num = isNaN(parsed) ? 0 : parsed;
  }

  const rawType = (input.type || '').trim().toUpperCase();

  let resolvedType: TransactionType;
  if (rawType === 'CREDIT' || rawType === 'INCOME') {
    resolvedType = 'CREDIT';
  } else if (rawType === 'DEBIT' || rawType === 'EXPENSE') {
    resolvedType = 'DEBIT';
  } else {
    // If type is not explicitly provided, infer from amount sign
    resolvedType = num < 0 ? 'DEBIT' : 'CREDIT';
  }

  // Enforce canonical sign
  const normalizedAmount = resolvedType === 'CREDIT' ? Math.abs(num) : -Math.abs(num);

  return {
    amount: normalizedAmount,
    type: resolvedType,
  };
}

/**
 * Predicate to test whether a transaction is an Income (Entrada)
 */
export function isIncomeTransaction(tx: { amount?: number | null; type?: string | null }): boolean {
  if (tx.type) {
    const t = tx.type.toUpperCase();
    if (t === 'CREDIT' || t === 'INCOME') return true;
    if (t === 'DEBIT' || t === 'EXPENSE') return false;
  }
  return (tx.amount ?? 0) > 0;
}

/**
 * Predicate to test whether a transaction is an Expense (Saída)
 */
export function isExpenseTransaction(tx: { amount?: number | null; type?: string | null }): boolean {
  if (tx.type) {
    const t = tx.type.toUpperCase();
    if (t === 'DEBIT' || t === 'EXPENSE') return true;
    if (t === 'CREDIT' || t === 'INCOME') return false;
  }
  return (tx.amount ?? 0) < 0;
}
