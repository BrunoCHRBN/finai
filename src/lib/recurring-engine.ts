/**
 * FinAI — Sprint 7: Deterministic Recurring Flows, Occurrences & Financial Reconciliation Engine
 *
 * Principles:
 * 1. Strict Accounting Separation:
 *    - REALIZED: Ledger transactions from bank or manual entry.
 *    - EXPECTED: Forecasted occurrences based on recurring flow schedule.
 *    - CONFIRMED: Occurrences reconciled with actual ledger movements or manually verified.
 *    - PROJECTED: Future cash balance starting from current bank balance + expected events.
 * 2. An expected income NEVER inflates current bank balance.
 * 3. Reconciling an occurrence with a transaction NEVER creates duplicate ledger entries.
 * 4. Deterministic Date Math: Correct handling of leap years (Feb 29), month lengths (30/31 days),
 *    and year boundaries.
 */

import { roundCurrency, safeNumeric } from './planning-engine.ts';
import { isInvoicePaymentDescription } from './transactions.ts';

export type RecurringFlowType = 'INCOME' | 'EXPENSE';
export type RecurringFlowNature = 'CONFIRMED' | 'ESTIMATED';
export type RecurringFlowAmountType = 'FIXED' | 'VARIABLE';
export type RecurringFrequency =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'SEMIMONTHLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUAL'
  | 'ONCE';

export type RecurringFlowStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

export type OccurrenceStatus =
  | 'PENDING'
  | 'OVERDUE'
  | 'RECONCILED'
  | 'MANUALLY_CONFIRMED'
  | 'CANCELLED';

export interface RecurringFlowModel {
  id: string;
  title: string;
  type: RecurringFlowType;
  nature: RecurringFlowNature;
  categoryId?: string | null;
  amount: number;
  amountType: RecurringFlowAmountType;
  frequency: RecurringFrequency;
  dayOfMonth?: number | null;
  secondDayOfMonth?: number | null;
  startDate?: string | null; // YYYY-MM-DD
  nextDate?: string | null; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  startMonth: string; // YYYY-MM
  endMonth?: string | null; // YYYY-MM
  totalInstallments?: number | null;
  remainingInstallments?: number | null;
  isActive: number | boolean;
  status: RecurringFlowStatus;
  destinationAccountId?: string | null;
  incomeCategory?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecurringOccurrenceModel {
  id: string; // Stable: `occ_${flowId}_${expectedDate}`
  flowId: string;
  expectedDate: string; // YYYY-MM-DD
  expectedAmount: number;
  status: OccurrenceStatus;
  transactionId?: string | null;
  reconciledAmount?: number | null;
  reconciledAt?: string | null;
  confidenceScore?: number | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type RecurringOccurrenceRecord = RecurringOccurrenceModel;
export type RecurringFlowRecord = RecurringFlowModel;

export interface ReconciliationCandidate {
  transactionId: string;
  transactionDate: string;
  transactionDescription: string;
  transactionAmount: number;
  score: number; // 0.0 to 1.0
  isExactAmount: boolean;
  isExactDate: boolean;
  dateDeltaDays: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
}

export interface ReconciliationEvaluation {
  occurrenceId: string;
  candidates: ReconciliationCandidate[];
  bestMatch: ReconciliationCandidate | null;
  isAmbiguous: boolean;
  canAutoReconcile: boolean;
}

// ============================================================================
// 1. DETERMINISTIC DATE UTILITIES
// ============================================================================

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 30;
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

export function parseDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.trim().split('-');
  if (parts.length < 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  return { year, month, day };
}

export function formatDateIso(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function clampDay(year: number, month: number, targetDay: number): number {
  const maxDay = getDaysInMonth(year, month);
  return Math.min(maxDay, Math.max(1, targetDay));
}

/**
 * Calculates absolute calendar days between two YYYY-MM-DD dates.
 */
export function daysBetween(dateStrA: string, dateStrB: string): number {
  const pA = parseDateParts(dateStrA);
  const pB = parseDateParts(dateStrB);
  if (!pA || !pB) return 9999;
  const utcA = Date.UTC(pA.year, pA.month - 1, pA.day);
  const utcB = Date.UTC(pB.year, pB.month - 1, pB.day);
  return Math.round((utcB - utcA) / (24 * 60 * 60 * 1000));
}

/**
 * Adds an integer number of days to a YYYY-MM-DD date.
 */
export function addDays(dateStr: string, days: number): string {
  const p = parseDateParts(dateStr);
  if (!p) return dateStr;
  const utc = Date.UTC(p.year, p.month - 1, p.day) + days * 24 * 60 * 60 * 1000;
  const d = new Date(utc);
  return formatDateIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Normalizes start and next date for a recurring flow.
 */
export function resolveFlowDates(flow: {
  dayOfMonth?: number | null;
  startDate?: string | null;
  startMonth?: string | null;
  frequency?: string | null;
}): { startDate: string; targetDay: number } {
  const targetDay = Math.min(31, Math.max(1, Math.round(safeNumeric(flow.dayOfMonth, 5))));
  let startDate = flow.startDate?.trim();

  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const sMonth = flow.startMonth?.trim() || '2026-10';
    const [yStr, mStr] = sMonth.split('-');
    const y = parseInt(yStr, 10) || 2026;
    const m = parseInt(mStr, 10) || 10;
    const d = clampDay(y, m, targetDay);
    startDate = formatDateIso(y, m, d);
  }

  return { startDate, targetDay };
}

// ============================================================================
// 2. OCCURRENCE GENERATION ENGINE
// ============================================================================

/**
 * Generates deterministic occurrences for a recurring flow within [fromDate, toDate].
 *
 * Explicit rules for edge cases:
 * - End of month / leap year: day 31 clamps to 30 or 28/29.
 * - Weekly: increments by exactly 7 days.
 * - Biweekly: increments by exactly 14 days.
 * - Quarterly: increments by 3 calendar months, preserving target day (clamped).
 * - Annual: increments by 12 calendar months, preserving target day (Feb 29 -> Feb 28 on non-leap).
 * - Once: emits only the single initial date.
 */
export function generateOccurrencesForFlow(
  flow: RecurringFlowModel,
  fromDate: string,
  toDate: string,
  maxOccurrences = 120
): RecurringOccurrenceModel[] {
  // If flow is ended before fromDate, or inactive without prior start, return empty
  if (flow.status === 'ENDED' && flow.endDate && flow.endDate < fromDate) {
    return [];
  }

  const { startDate, targetDay } = resolveFlowDates(flow);
  const freq = (flow.frequency || 'MONTHLY').toUpperCase() as RecurringFrequency;
  const pStart = parseDateParts(startDate);
  if (!pStart) return [];

  const flowEndDate = flow.endDate?.trim() || null;
  const flowEndMonth = flow.endMonth?.trim() || null;
  const totalInstallments =
    flow.totalInstallments != null ? Math.max(1, Math.round(Number(flow.totalInstallments))) : null;

  const result: RecurringOccurrenceModel[] = [];

  if (freq === 'ONCE') {
    if (startDate >= fromDate && startDate <= toDate) {
      if (!flowEndDate || startDate <= flowEndDate) {
        result.push({
          id: `occ_${flow.id}_${startDate}`,
          flowId: flow.id,
          expectedDate: startDate,
          expectedAmount: roundCurrency(flow.amount),
          status: 'PENDING',
          createdAt: flow.createdAt || new Date().toISOString(),
          updatedAt: flow.updatedAt || new Date().toISOString(),
        });
      }
    }
    return result;
  }

  if (freq === 'WEEKLY' || freq === 'BIWEEKLY') {
    const stepDays = freq === 'WEEKLY' ? 7 : 14;
    let currDate = startDate;
    let installmentIndex = 0;
    let safetyLoops = 0;

    while (currDate <= toDate && result.length < maxOccurrences && safetyLoops < 10000) {
      safetyLoops++;
      if (totalInstallments !== null && installmentIndex >= totalInstallments) break;
      if (flowEndDate && currDate > flowEndDate) break;

      if (currDate >= fromDate) {
        result.push({
          id: `occ_${flow.id}_${currDate}`,
          flowId: flow.id,
          expectedDate: currDate,
          expectedAmount: roundCurrency(flow.amount),
          status: 'PENDING',
          createdAt: flow.createdAt || new Date().toISOString(),
          updatedAt: flow.updatedAt || new Date().toISOString(),
        });
      }

      currDate = addDays(currDate, stepDays);
      installmentIndex++;
    }
    return result;
  }

  // Semi-monthly: 2 deterministic occurrences per month on designated days without cumulative date drift
  if (freq === 'SEMIMONTHLY') {
    const d1 = targetDay;
    const rawD2 =
      flow.secondDayOfMonth != null
        ? Math.min(31, Math.max(1, Math.round(Number(flow.secondDayOfMonth))))
        : (d1 <= 15 ? d1 + 15 : d1 - 15);
    const day1 = Math.min(d1, rawD2);
    const day2 = Math.max(d1, rawD2) === day1 ? Math.min(31, day1 + 15) : Math.max(d1, rawD2);

    let curYear = pStart.year;
    let curMonth = pStart.month;
    let installmentIndex = 0;
    let safetyLoops = 0;

    while (result.length < maxOccurrences && safetyLoops < 5000) {
      safetyLoops++;
      const daysForMonth = [day1, day2];
      for (const targetD of daysForMonth) {
        if (totalInstallments !== null && installmentIndex >= totalInstallments) break;

        const clampedD = clampDay(curYear, curMonth, targetD);
        const occurrenceDate = formatDateIso(curYear, curMonth, clampedD);

        if (occurrenceDate > toDate) break;
        if (flowEndDate && occurrenceDate > flowEndDate) break;
        if (flowEndMonth && occurrenceDate.slice(0, 7) > flowEndMonth) break;

        if (occurrenceDate >= fromDate && occurrenceDate >= startDate) {
          result.push({
            id: `occ_${flow.id}_${occurrenceDate}`,
            flowId: flow.id,
            expectedDate: occurrenceDate,
            expectedAmount: roundCurrency(flow.amount),
            status: 'PENDING',
            createdAt: flow.createdAt || new Date().toISOString(),
            updatedAt: flow.updatedAt || new Date().toISOString(),
          });
        }
        installmentIndex++;
      }

      if (totalInstallments !== null && installmentIndex >= totalInstallments) break;
      const totalM = curYear * 12 + (curMonth - 1) + 1;
      curYear = Math.floor(totalM / 12);
      curMonth = (totalM % 12) + 1;
      if (formatDateIso(curYear, curMonth, 1) > toDate) break;
    }

    return result;
  }

  // Month-based frequencies: MONTHLY, QUARTERLY, ANNUAL/YEARLY
  const monthStep =
    freq === 'QUARTERLY' ? 3 : freq === 'ANNUAL' || (freq as string) === 'YEARLY' ? 12 : 1;
  let curYear = pStart.year;
  let curMonth = pStart.month;
  let installmentIndex = 0;
  let safetyLoops = 0;

  while (result.length < maxOccurrences && safetyLoops < 5000) {
    safetyLoops++;
    if (totalInstallments !== null && installmentIndex >= totalInstallments) break;

    const clampedDay = clampDay(curYear, curMonth, targetDay);
    const occurrenceDate = formatDateIso(curYear, curMonth, clampedDay);

    if (occurrenceDate > toDate) break;
    if (flowEndDate && occurrenceDate > flowEndDate) break;
    if (flowEndMonth && occurrenceDate.slice(0, 7) > flowEndMonth) break;

    if (occurrenceDate >= fromDate && occurrenceDate >= startDate) {
      result.push({
        id: `occ_${flow.id}_${occurrenceDate}`,
        flowId: flow.id,
        expectedDate: occurrenceDate,
        expectedAmount: roundCurrency(flow.amount),
        status: 'PENDING',
        createdAt: flow.createdAt || new Date().toISOString(),
        updatedAt: flow.updatedAt || new Date().toISOString(),
      });
    }

    installmentIndex++;
    // Advance by monthStep
    const totalM = curYear * 12 + (curMonth - 1) + monthStep;
    curYear = Math.floor(totalM / 12);
    curMonth = (totalM % 12) + 1;
  }

  return result;
}

/**
 * Derives occurrence status based on current date without unnecessary database copies.
 */
export function deriveOccurrenceStatus(
  occurrence: { expectedDate: string; status: OccurrenceStatus; transactionId?: string | null },
  todayDate: string
): OccurrenceStatus {
  if (occurrence.status === 'RECONCILED' || occurrence.status === 'MANUALLY_CONFIRMED' || occurrence.status === 'CANCELLED') {
    return occurrence.status;
  }
  if (occurrence.expectedDate < todayDate) {
    return 'OVERDUE';
  }
  return 'PENDING';
}

// ============================================================================
// 3. RECONCILIATION ENGINE
// ============================================================================

export interface TransactionForReconciliation {
  id: string;
  accountId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  description: string;
  type: string; // CREDIT, DEBIT, TRANSFER
  status?: string;
  isIgnored?: number | boolean;
  transferId?: string | null;
}

export interface ReconciliationOptions {
  dateToleranceDays?: number; // default: 5
  amountTolerancePct?: number; // default: 10% for fixed, 30% for variable
  autoReconcileThreshold?: number; // default: 0.85
}

/**
 * Evaluates candidate transactions to match a forecasted occurrence.
 *
 * Rules:
 * - Incomes require incoming credit transactions (amount > 0 or type === 'CREDIT').
 * - Outflows require debits.
 * - Ignored transactions (isIgnored = 1), transfers (TRANSFER or transferId), and invoice payments are strictly rejected.
 * - Detects ambiguity: If 2 or more transactions have high scores, marks as AMBIGUOUS and requires manual confirmation.
 */
export function evaluateReconciliation(
  occurrence: RecurringOccurrenceModel,
  flow: RecurringFlowModel,
  availableTransactions: TransactionForReconciliation[],
  options: ReconciliationOptions = {}
): ReconciliationEvaluation {
  const dateTolerance = options.dateToleranceDays ?? 5;
  const autoThreshold = options.autoReconcileThreshold ?? 0.85;
  const isIncome = flow.type === 'INCOME';
  const isFixed = (flow.amountType || 'FIXED') === 'FIXED';

  const candidates: ReconciliationCandidate[] = [];

  for (const tx of availableTransactions) {
    // 1. Exclude ignored, internal transfers and credit card invoice settlements
    if (tx.isIgnored === 1 || tx.isIgnored === true) continue;
    if (tx.type === 'TRANSFER' || Boolean(tx.transferId)) continue;
    if (isInvoicePaymentDescription(tx.description)) continue;

    // 2. Nature check: Income requires positive amount / CREDIT. Expense requires negative / DEBIT.
    const txTypeUpper = (tx.type || '').toUpperCase();
    const isTxCredit = txTypeUpper === 'CREDIT' || (txTypeUpper !== 'DEBIT' && tx.amount > 0);
    if (isIncome && !isTxCredit) continue;
    if (!isIncome && isTxCredit) continue;

    // 3. Date window check
    const deltaDays = daysBetween(occurrence.expectedDate, tx.date);
    if (Math.abs(deltaDays) > dateTolerance) continue;

    // 4. Amount matching
    const txMagnitude = Math.abs(tx.amount);
    const expMagnitude = Math.abs(occurrence.expectedAmount);
    const diffAmount = Math.abs(txMagnitude - expMagnitude);
    const isExactAmount = diffAmount < 0.01;
    const pctDiff = expMagnitude > 0 ? (diffAmount / expMagnitude) * 100 : 100;

    // Fixed flows require closer amount tolerance; variable flows accept wider variance
    const maxPct = isFixed ? (options.amountTolerancePct ?? 10) : 40;
    if (!isExactAmount && pctDiff > maxPct) {
      continue;
    }

    // 5. Compute deterministic matching score
    let score = 0;
    const reasons: string[] = [];

    // Date score (0 to 0.40)
    const isExactDate = deltaDays === 0;
    if (isExactDate) {
      score += 0.40;
      reasons.push('Data exata do agendamento');
    } else {
      const datePenalty = Math.min(0.35, (Math.abs(deltaDays) / dateTolerance) * 0.35);
      score += Math.max(0.05, 0.40 - datePenalty);
      reasons.push(`Diferença de ${Math.abs(deltaDays)} dia(s)`);
    }

    // Amount score (0 to 0.40)
    if (isExactAmount) {
      score += 0.40;
      reasons.push('Valor idêntico à previsão');
    } else {
      const amountPenalty = (pctDiff / maxPct) * 0.25;
      score += Math.max(0.10, 0.40 - amountPenalty);
      reasons.push(`Variação de ${pctDiff.toFixed(1)}% no valor`);
    }

    // Account score (0 to 0.10)
    if (flow.destinationAccountId && tx.accountId === flow.destinationAccountId) {
      score += 0.10;
      reasons.push('Conta de destino confirmada');
    }

    // Description score (0 to 0.10)
    const normDesc = (tx.description || '').toUpperCase();
    const normTitle = (flow.title || '').toUpperCase();
    const words = normTitle.split(/\s+/).filter((w) => w.length >= 3);
    const matchedWord = words.find((w) => normDesc.includes(w));
    if (matchedWord) {
      score += 0.10;
      reasons.push(`Palavra-chave "${matchedWord}" encontrada`);
    }

    score = Math.min(1.0, Math.max(0.0, Math.round(score * 100) / 100));

    let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (score >= 0.85) confidenceLevel = 'HIGH';
    else if (score >= 0.65) confidenceLevel = 'MEDIUM';

    candidates.push({
      transactionId: tx.id,
      transactionDate: tx.date,
      transactionDescription: tx.description,
      transactionAmount: tx.amount,
      score,
      isExactAmount,
      isExactDate,
      dateDeltaDays: deltaDays,
      confidenceLevel,
      reasons,
    });
  }

  // Sort candidates by score descending, then by date proximity
  candidates.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.05) {
      return b.score - a.score;
    }
    return Math.abs(a.dateDeltaDays) - Math.abs(b.dateDeltaDays);
  });

  const bestMatch = candidates[0] || null;

  // Ambiguity detection: If there are multiple candidates and top 2 are both plausible (score >= 0.65)
  // and close in score (< 0.15 difference), it must not be auto-reconciled!
  let isAmbiguous = false;
  if (candidates.length >= 2) {
    const top1 = candidates[0];
    const top2 = candidates[1];
    if (top1.score >= 0.65 && top2.score >= 0.65 && Math.abs(top1.score - top2.score) < 0.15) {
      isAmbiguous = true;
    }
  }

  const canAutoReconcile =
    Boolean(bestMatch) &&
    bestMatch!.score >= autoThreshold &&
    !isAmbiguous;

  return {
    occurrenceId: occurrence.id,
    candidates,
    bestMatch,
    isAmbiguous,
    canAutoReconcile,
  };
}

/**
 * Pure function: Reconciles an occurrence with a transaction.
 */
export function applyReconciliation(
  occurrence: RecurringOccurrenceModel,
  transaction: { id: string; amount: number },
  score = 1.0,
  notes?: string
): RecurringOccurrenceModel {
  const now = new Date().toISOString();
  return {
    ...occurrence,
    status: 'RECONCILED',
    transactionId: transaction.id,
    reconciledAmount: Math.abs(transaction.amount),
    reconciledAt: now,
    confidenceScore: score,
    notes: notes || occurrence.notes,
    updatedAt: now,
  };
}

/**
 * Pure function: Cancels / unreconciles an occurrence back to PENDING.
 */
export function unapplyReconciliation(
  occurrence: RecurringOccurrenceModel,
  todayDate: string
): RecurringOccurrenceModel {
  const now = new Date().toISOString();
  const nextStatus = occurrence.expectedDate < todayDate ? 'OVERDUE' : 'PENDING';
  return {
    ...occurrence,
    status: nextStatus,
    transactionId: null,
    reconciledAmount: null,
    reconciledAt: null,
    confidenceScore: null,
    updatedAt: now,
  };
}

export function detectAmbiguousMatches(candidates: ReconciliationCandidate[]): boolean {
  if (candidates.length < 2) return false;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  return (sorted[0].score - sorted[1].score) < 0.15;
}

export const generateOccurrences = generateOccurrencesForFlow;
export const evaluateOccurrenceStatus = deriveOccurrenceStatus;
