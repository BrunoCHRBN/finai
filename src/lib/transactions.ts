/**
 * FinAI Canonical Transaction Classification & Normalization Domain Layer
 *
 * Core Financial Conventions:
 * - CREDIT: Operating Inflow / Income / Salário / Depósito / Reembolso Operacional.
 *   Canonical Amount: ALWAYS POSITIVE (+Math.abs(amount)).
 * - DEBIT: Operating Outflow / Expense / Compra / Tarifa Operacional.
 *   Canonical Amount: ALWAYS NEGATIVE (-Math.abs(amount)).
 * - TRANSFER: Cash movement between user's own accounts or debt liquidation
 *   (e.g., Pix between own accounts, credit card invoice settlement).
 *   Affects only individual account balances; ZERO impact on operating income & expenses.
 *   Outflow leg is NEGATIVE (-Math.abs(amount)), inflow leg is POSITIVE (+Math.abs(amount)).
 */

export type TransactionType = 'CREDIT' | 'DEBIT' | 'TRANSFER';

export interface RawTransactionInput {
  amount: number | string | null | undefined;
  type?: string | null;
  description?: string | null;
  isIgnored?: number | boolean | null;
  transferId?: string | null;
}

export interface NormalizedTransactionValues {
  amount: number;
  type: TransactionType;
  isIgnored: number;
  transferId?: string | null;
}

/**
 * Normalizes transaction values into the FinAI canonical domain representation.
 *
 * Handles:
 * - Credit card purchases returned by Open Finance with positive amounts but type 'DEBIT'.
 * - Self-transfers with explicit 'TRANSFER' type.
 * - Negative credit or positive debit inversions from upstream bank APIs.
 * - String amounts with comma or period decimal separators.
 * - Coercion of invalid/null numbers to 0.
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
  if (rawType === 'TRANSFER') {
    resolvedType = 'TRANSFER';
  } else if (rawType === 'CREDIT' || rawType === 'INCOME') {
    resolvedType = 'CREDIT';
  } else if (rawType === 'DEBIT' || rawType === 'EXPENSE') {
    resolvedType = 'DEBIT';
  } else {
    // If type is not explicitly provided, infer from amount sign
    resolvedType = num < 0 ? 'DEBIT' : 'CREDIT';
  }

  // Canonical sign enforcement
  let normalizedAmount: number;
  if (resolvedType === 'TRANSFER') {
    // Preserves directional sign: negative for source account outflow, positive for destination account inflow
    normalizedAmount = num < 0 ? -Math.abs(num) : Math.abs(num);
  } else if (resolvedType === 'CREDIT') {
    normalizedAmount = Math.abs(num);
  } else {
    normalizedAmount = -Math.abs(num);
  }

  const isIgnored = input.isIgnored === 1 || input.isIgnored === true ? 1 : 0;

  return {
    amount: Math.round(normalizedAmount * 100) / 100,
    type: resolvedType,
    isIgnored,
    transferId: input.transferId || null,
  };
}

/**
 * Predicate to test whether a transaction is an Income (Entrada Operacional).
 * Returns FALSE for TRANSFER transactions and ignored transactions.
 */
export function isIncomeTransaction(tx: {
  amount?: number | null;
  type?: string | null;
  isIgnored?: number | boolean | null;
}): boolean {
  if (isIgnoredTransaction(tx)) return false;
  const t = (tx.type || '').toUpperCase();
  if (t === 'TRANSFER') return false;
  if (t === 'CREDIT' || t === 'INCOME') return true;
  if (t === 'DEBIT' || t === 'EXPENSE') return false;
  return (tx.amount ?? 0) > 0;
}

/**
 * Predicate to test whether a transaction is an Expense (Saída Operacional).
 * Returns FALSE for TRANSFER transactions and ignored transactions.
 */
export function isExpenseTransaction(tx: {
  amount?: number | null;
  type?: string | null;
  isIgnored?: number | boolean | null;
}): boolean {
  if (isIgnoredTransaction(tx)) return false;
  const t = (tx.type || '').toUpperCase();
  if (t === 'TRANSFER') return false;
  if (t === 'DEBIT' || t === 'EXPENSE') return true;
  if (t === 'CREDIT' || t === 'INCOME') return false;
  return (tx.amount ?? 0) < 0;
}

/**
 * Predicate to test whether a transaction is a Transfer (Transferência entre contas próprias ou liquidação de fatura).
 */
export function isTransferTransaction(tx: { type?: string | null }): boolean {
  return (tx.type || '').toUpperCase() === 'TRANSFER';
}

/**
 * Predicate to test whether a transaction has been ignored by the user.
 */
export function isIgnoredTransaction(tx: { isIgnored?: number | boolean | null }): boolean {
  return tx.isIgnored === 1 || tx.isIgnored === true;
}

export interface ReconcileCandidate {
  id: string;
  accountId: string;
  amount: number;
  date: string;
  type: string;
  description?: string | null;
  isIgnored?: number | boolean | null;
  transferId?: string | null;
}

/**
 * Detects and reconciles self-transfers between user's own accounts.
 *
 * Matching Criteria (all must be satisfied):
 * 1. Both accounts belong to the user's registered account list (accA !== accB).
 * 2. Absolute amounts match exactly (within 0.01 tolerance).
 * 3. Execution dates are within 1 calendar day of each other.
 * 4. One leg is an outflow (amount < 0) and the other is an inflow (amount > 0).
 * 5. Neither transaction is already paired with another transfer.
 *
 * Produces paired transfer records with type 'TRANSFER' and shared transferId.
 */
export function detectAndReconcileSelfTransfers<T extends ReconcileCandidate>(
  transactions: T[],
  userAccountIds: Set<string> | string[]
): T[] {
  const accountIdSet = userAccountIds instanceof Set ? userAccountIds : new Set(userAccountIds);
  const result: T[] = transactions.map((t) => ({ ...t }));
  const matchedIndices = new Set<number>();

  for (let i = 0; i < result.length; i++) {
    if (matchedIndices.has(i)) continue;
    const txA = result[i];

    // Must belong to an internal user account
    if (!accountIdSet.has(txA.accountId)) continue;

    const absA = Math.abs(txA.amount);
    if (absA === 0) continue;

    const dateA = new Date(txA.date).getTime();
    if (isNaN(dateA)) continue;

    for (let j = i + 1; j < result.length; j++) {
      if (matchedIndices.has(j)) continue;
      const txB = result[j];

      // Must be a different user account
      if (txA.accountId === txB.accountId) continue;
      if (!accountIdSet.has(txB.accountId)) continue;

      // Amounts must be opposite signs and same absolute value
      const absB = Math.abs(txB.amount);
      if (Math.abs(absA - absB) > 0.01) continue;

      const isOpposite = (txA.amount < 0 && txB.amount > 0) || (txA.amount > 0 && txB.amount < 0);
      if (!isOpposite) continue;

      // Dates within 24 hours (86,400,000 ms) + 1 hour leeway for timezone differences
      const dateB = new Date(txB.date).getTime();
      if (isNaN(dateB)) continue;

      const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
      if (diffDays <= 1.5) {
        // Confirmed Match!
        const pairId = txA.transferId || txB.transferId || `tr_${txA.id.slice(0, 8)}_${txB.id.slice(0, 8)}`;
        txA.type = 'TRANSFER';
        txA.transferId = pairId;
        txB.type = 'TRANSFER';
        txB.transferId = pairId;

        matchedIndices.add(i);
        matchedIndices.add(j);
        break;
      }
    }
  }

  return result;
}

/**
 * Checks whether an expense or credit transaction corresponds to a credit card invoice payment
 * to prevent double-counting when individual credit card purchases are already tracked.
 */
export function isInvoicePaymentDescription(description?: string | null): boolean {
  if (!description) return false;
  const desc = description.toUpperCase();
  return (
    desc.includes('PAGAMENTO FATURA') ||
    desc.includes('PGTO FATURA') ||
    desc.includes('PAGAMENTO CARTAO') ||
    desc.includes('PAGAMENTO DE CARTAO') ||
    desc.includes('PAGAMENTO DE FATURA') ||
    desc.includes('PAGAMENTO BOLETO BCO') ||
    desc.includes('PAGAMENTO BOLETO BANCO') ||
    desc.includes('PAGAMENTO FATURA CARTAO')
  );
}

/**
 * Checks whether a CREDIT transaction represents a credit card purchase refund/estorno
 * or an explicit purchase reversal (estorno/reembolso de compra/chargeback) rather than
 * operating revenue/salary.
 *
 * Accounting Rule:
 * - Credit card refunds and purchase estornos offset operating expenses in the period
 *   and must NEVER inflate operating income (salary/revenue).
 */
export function isExpenseRefundOrEstorno(tx: {
  type?: string | null;
  description?: string | null;
  accountType?: string | null;
}): boolean {
  const rawType = (tx.type || '').trim().toUpperCase();
  if (rawType !== 'CREDIT') return false;
  if (isInvoicePaymentDescription(tx.description)) return false;

  const accType = (tx.accountType || '').trim().toUpperCase();
  if (accType === 'CREDIT_CARD') {
    return true;
  }

  if (!tx.description) return false;
  return /\b(?:estorno|reembolso\s+(?:compra|cart[aã]o|uber|ifood|amazon|mercado)|chargeback|devolu[cç][aã]o\s+compra|cr[eé]dito\s+estorno)\b/i.test(
    tx.description
  );
}
