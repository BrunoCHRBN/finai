/**
 * FinAI Deterministic Patrimonial & Balance Sheet Domain Engine
 *
 * Core Financial Conventions & Invariants:
 * 1. Net Worth (Patrimônio Líquido) = Total Assets − Total Liabilities.
 * 2. Assets:
 *    - Bank accounts (CHECKING, SAVINGS, INVESTMENT) with positive balance.
 *    - Manual real assets (Real estate, vehicles, equity, private investments, valuables).
 * 3. Liabilities:
 *    - Credit card outstanding balances (faturas em aberto).
 *    - Negative checking balances (overdraft / cheque especial).
 *    - Manual structured debts (Mortgages, auto financing, personal/payroll loans).
 * 4. Double Counting Prevention:
 *    - Bank accounts are counted strictly ONCE.
 *    - Credit card limits are NEVER treated as assets or wealth.
 *    - Self-transfers (TRANSFER) move wealth between accounts without altering total net worth.
 *    - Invoice payments settle credit debt by reducing cash, keeping net worth neutral.
 *    - Debt principal amortizations reduce liabilities deterministically.
 * 5. Full Data Source Traceability:
 *    - Every item reports whether it is OPEN_FINANCE (verified) or MANUAL (user-declared).
 */

export type AssetCategory =
  | 'CASH'
  | 'INVESTMENT'
  | 'REAL_ESTATE'
  | 'VEHICLE'
  | 'EQUITY'
  | 'VALUABLE'
  | 'OTHER';

export type LiabilityCategory =
  | 'CREDIT_CARD'
  | 'OVERDRAFT_DEBT'
  | 'REAL_ESTATE_MORTGAGE'
  | 'VEHICLE_FINANCING'
  | 'PERSONAL_LOAN'
  | 'PAYROLL_LOAN'
  | 'TAX_DEBT'
  | 'OTHER';

export type DataSource = 'OPEN_FINANCE' | 'MANUAL' | 'ESTIMATED';

export interface RawAccountInput {
  id: string;
  name: string;
  type: string; // CHECKING, CREDIT_CARD, SAVINGS, INVESTMENT
  balance: number | null | undefined;
  institutionName?: string | null;
  currencyCode?: string;
  updatedAt?: string | null;
  pluggyAccountId?: string | null;
}

export interface RawPatrimonialAssetInput {
  id: string;
  name: string;
  category: string;
  currentValue: number | string | null | undefined;
  acquisitionValue?: number | string | null;
  acquisitionDate?: string | null;
  valuationDate?: string | null;
  liquidity?: string | null;
  notes?: string | null;
  dataSource?: string | null;
  updatedAt?: string | null;
}

export interface RawPatrimonialLiabilityInput {
  id: string;
  name: string;
  category: string;
  currentBalance: number | string | null | undefined;
  originalAmount?: number | string | null;
  interestRate?: number | string | null;
  startDate?: string | null;
  dueDate?: string | null;
  installmentsTotal?: number | null;
  installmentsRemaining?: number | null;
  monthlyPayment?: number | string | null;
  creditor?: string | null;
  notes?: string | null;
  dataSource?: string | null;
  updatedAt?: string | null;
}

export interface PatrimonialItem {
  id: string;
  name: string;
  category: string;
  itemType: 'ASSET' | 'LIABILITY';
  value: number;
  dataSource: DataSource;
  referenceDate: string;
  institutionOrCreditor?: string;
  liquidity?: string;
  notes?: string;
}

export interface CategoryBreakdown {
  category: string;
  label: string;
  total: number;
  percentageOfAssets: number;
  count: number;
}

export interface PatrimonialSummary {
  // Core Totals
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;

  // Asset Breakdown
  liquidAssets: number; // Immediate liquidity (checking, savings, physical cash)
  investedAssets: number; // Market investments, CDBs, funds, stocks
  fixedAssets: number; // Real estate, vehicles, equity, physical valuables
  otherAssets: number;

  // Liability Breakdown
  shortTermLiabilities: number; // Credit card invoices, overdrafts
  longTermLiabilities: number; // Mortgages, loans, structured financing

  // Financial Health Metrics
  debtToAssetRatioPct: number;
  solvencyStatus: 'EXCELLENT' | 'HEALTHY' | 'LEVERAGED' | 'DEFICIT';

  // Allocation Percentages
  allocation: {
    liquidPct: number;
    investedPct: number;
    fixedPct: number;
  };

  // Detailed Items & Composition
  composition: CategoryBreakdown[];
  assetsList: PatrimonialItem[];
  liabilitiesList: PatrimonialItem[];

  // Audit and Metainfo
  calculatedAt: string;
  totalItemsCount: number;
}

function safeNumber(v: unknown): number {
  if (typeof v === 'number') {
    return isNaN(v) || !isFinite(v) ? 0 : v;
  }
  if (typeof v === 'string') {
    const cleaned = v.trim().replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
  }
  return 0;
}

const CATEGORY_LABELS: Record<string, string> = {
  CASH: 'Caixa & Liquidez Imediata',
  INVESTMENT: 'Investimentos & Aplicações',
  REAL_ESTATE: 'Imóveis & Propriedades',
  VEHICLE: 'Veículos & Automóveis',
  EQUITY: 'Participações & Negócios',
  VALUABLE: 'Bens de Alto Valor',
  OTHER: 'Outros Ativos',
  CREDIT_CARD: 'Cartões de Crédito (Faturas)',
  OVERDRAFT_DEBT: 'Cheque Especial Utilizado',
  REAL_ESTATE_MORTGAGE: 'Financiamento Imobiliário',
  VEHICLE_FINANCING: 'Financiamento de Veículos',
  PERSONAL_LOAN: 'Empréstimos Pessoais',
  PAYROLL_LOAN: 'Crédito Consignado',
  TAX_DEBT: 'Dívidas Fiscais',
};

/**
 * Pure, deterministic calculation of complete balance sheet and net worth
 */
export function calculatePatrimonialSummary(
  accounts: RawAccountInput[],
  manualAssets: RawPatrimonialAssetInput[] = [],
  manualLiabilities: RawPatrimonialLiabilityInput[] = []
): PatrimonialSummary {
  const calculatedAt = new Date().toISOString();
  const todayStr = calculatedAt.split('T')[0];

  const assetsList: PatrimonialItem[] = [];
  const liabilitiesList: PatrimonialItem[] = [];

  let liquidAssets = 0;
  let investedAssets = 0;
  let fixedAssets = 0;
  let otherAssets = 0;

  let shortTermLiabilities = 0;
  let longTermLiabilities = 0;

  // 1. Process Bank Accounts
  for (const acc of accounts) {
    const rawBalance = safeNumber(acc.balance);
    const isPluggy = Boolean(acc.pluggyAccountId);
    const dataSource: DataSource = isPluggy ? 'OPEN_FINANCE' : 'MANUAL';
    const accType = (acc.type || '').toUpperCase();
    const refDate = acc.updatedAt ? acc.updatedAt.split('T')[0] : todayStr;

    if (accType === 'CREDIT_CARD') {
      // Credit Card Balance: In Brazilian Open Finance, positive balance represents current debt / used credit
      const cardDebt = Math.max(0, rawBalance);
      if (cardDebt > 0) {
        shortTermLiabilities += cardDebt;
        liabilitiesList.push({
          id: `acc-liab-${acc.id}`,
          name: `${acc.name || 'Cartão de Crédito'} (Fatura)`,
          category: 'CREDIT_CARD',
          itemType: 'LIABILITY',
          value: Math.round(cardDebt * 100) / 100,
          dataSource,
          referenceDate: refDate,
          institutionOrCreditor: acc.institutionName || 'Cartão Conectado',
        });
      }
    } else {
      // Checking, Savings, or Investment accounts
      if (rawBalance >= 0) {
        let category: AssetCategory = 'CASH';
        if (accType === 'INVESTMENT') {
          category = 'INVESTMENT';
          investedAssets += rawBalance;
        } else {
          // CHECKING or SAVINGS
          category = 'CASH';
          liquidAssets += rawBalance;
        }

        assetsList.push({
          id: `acc-asset-${acc.id}`,
          name: acc.name || 'Conta Bancária',
          category,
          itemType: 'ASSET',
          value: Math.round(rawBalance * 100) / 100,
          dataSource,
          referenceDate: refDate,
          institutionOrCreditor: acc.institutionName || 'Banco Conectado',
          liquidity: 'IMMEDIATE',
        });
      } else {
        // Negative Checking Balance = Overdraft debt (cheque especial)
        const overdraft = Math.abs(rawBalance);
        shortTermLiabilities += overdraft;
        liabilitiesList.push({
          id: `acc-overdraft-${acc.id}`,
          name: `${acc.name || 'Conta'} (Cheque Especial Utilizado)`,
          category: 'OVERDRAFT_DEBT',
          itemType: 'LIABILITY',
          value: Math.round(overdraft * 100) / 100,
          dataSource,
          referenceDate: refDate,
          institutionOrCreditor: acc.institutionName || 'Banco Conectado',
        });
      }
    }
  }

  // 2. Process Manual Assets
  for (const asset of manualAssets) {
    const val = Math.max(0, safeNumber(asset.currentValue));
    const cat = (asset.category || 'OTHER').toUpperCase() as AssetCategory;
    const refDate = asset.valuationDate || asset.updatedAt?.split('T')[0] || todayStr;

    if (cat === 'CASH') {
      liquidAssets += val;
    } else if (cat === 'INVESTMENT') {
      investedAssets += val;
    } else if (['REAL_ESTATE', 'VEHICLE', 'EQUITY', 'VALUABLE'].includes(cat)) {
      fixedAssets += val;
    } else {
      otherAssets += val;
    }

    assetsList.push({
      id: asset.id,
      name: asset.name || 'Ativo Patrimonial',
      category: cat,
      itemType: 'ASSET',
      value: Math.round(val * 100) / 100,
      dataSource: (asset.dataSource as DataSource) || 'MANUAL',
      referenceDate: refDate,
      liquidity: asset.liquidity || 'MEDIUM',
      notes: asset.notes || undefined,
    });
  }

  // 3. Process Manual Liabilities
  for (const liab of manualLiabilities) {
    const balance = Math.max(0, safeNumber(liab.currentBalance));
    const cat = (liab.category || 'OTHER').toUpperCase() as LiabilityCategory;
    const refDate = liab.updatedAt?.split('T')[0] || todayStr;

    longTermLiabilities += balance;

    liabilitiesList.push({
      id: liab.id,
      name: liab.name || 'Passivo / Dívida',
      category: cat,
      itemType: 'LIABILITY',
      value: Math.round(balance * 100) / 100,
      dataSource: 'MANUAL',
      referenceDate: refDate,
      institutionOrCreditor: liab.creditor || undefined,
      notes: liab.notes || undefined,
    });
  }

  // 4. Summarize Totals
  const totalAssets = Math.round((liquidAssets + investedAssets + fixedAssets + otherAssets) * 100) / 100;
  const totalLiabilities = Math.round((shortTermLiabilities + longTermLiabilities) * 100) / 100;
  const netWorth = Math.round((totalAssets - totalLiabilities) * 100) / 100;

  // 5. Calculate Allocation Percentages
  const assetBase = totalAssets > 0 ? totalAssets : 1;
  const liquidPct = totalAssets > 0 ? Math.round((liquidAssets / assetBase) * 100) : 0;
  const investedPct = totalAssets > 0 ? Math.round((investedAssets / assetBase) * 100) : 0;
  const fixedPct = totalAssets > 0 ? Math.round((fixedAssets / assetBase) * 100) : 0;

  // 6. Solvency Status & Debt Ratio
  const debtToAssetRatioPct = totalAssets > 0 ? Math.round((totalLiabilities / assetBase) * 100) : (totalLiabilities > 0 ? 100 : 0);
  let solvencyStatus: PatrimonialSummary['solvencyStatus'] = 'HEALTHY';
  if (netWorth <= 0) {
    solvencyStatus = 'DEFICIT';
  } else if (debtToAssetRatioPct < 20) {
    solvencyStatus = 'EXCELLENT';
  } else if (debtToAssetRatioPct <= 50) {
    solvencyStatus = 'HEALTHY';
  } else {
    solvencyStatus = 'LEVERAGED';
  }

  // 7. Category Breakdown
  const categoryMap: Record<string, { total: number; count: number }> = {};
  for (const asset of assetsList) {
    if (!categoryMap[asset.category]) {
      categoryMap[asset.category] = { total: 0, count: 0 };
    }
    categoryMap[asset.category].total += asset.value;
    categoryMap[asset.category].count += 1;
  }

  const composition: CategoryBreakdown[] = Object.entries(categoryMap).map(([cat, data]) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] || cat,
    total: Math.round(data.total * 100) / 100,
    percentageOfAssets: totalAssets > 0 ? Math.round((data.total / assetBase) * 100) : 0,
    count: data.count,
  }));

  // Sort composition by largest value first
  composition.sort((a, b) => b.total - a.total);

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    liquidAssets: Math.round(liquidAssets * 100) / 100,
    investedAssets: Math.round(investedAssets * 100) / 100,
    fixedAssets: Math.round(fixedAssets * 100) / 100,
    otherAssets: Math.round(otherAssets * 100) / 100,
    shortTermLiabilities: Math.round(shortTermLiabilities * 100) / 100,
    longTermLiabilities: Math.round(longTermLiabilities * 100) / 100,
    debtToAssetRatioPct,
    solvencyStatus,
    allocation: {
      liquidPct,
      investedPct,
      fixedPct,
    },
    composition,
    assetsList,
    liabilitiesList,
    calculatedAt,
    totalItemsCount: assetsList.length + liabilitiesList.length,
  };
}
