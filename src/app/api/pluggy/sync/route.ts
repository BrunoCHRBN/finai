import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { accounts, transactions, categories } from '@/db/schema';
import { getPluggyAccounts, getPluggyTransactions } from '@/lib/pluggy';
import { eq } from 'drizzle-orm';

/**
 * Categorization rules engine (0 tokens)
 * Maps common Brazilian merchants/patterns to category IDs
 */
function matchCategoryByRule(description: string, allCategories: Array<{ id: string; name: string }>): string | null {
  const desc = description.toUpperCase();

  const rules: Array<{ pattern: RegExp; nameMatch: string }> = [
    { pattern: /IFOOD|UBER EATS|RAPPI|RESTAURANTE|BURGER|OUTBACK|MCDONALD|PADARIA|PIZZARIA/i, nameMatch: 'Restaurantes & Delivery' },
    { pattern: /MERCADO|SUPERMERCADO|PAO DE ACUCAR|CARREFOUR|ASSAI|ATACADAO|EXTRA/i, nameMatch: 'Supermercado & Essenciais' },
    { pattern: /UBER|99APP|99 TECNOLOGIA|POSTO|IPIRANGA|SHELL|COMBUSTIVEL|ESTAPAR/i, nameMatch: 'Transporte (Uber/Combustível)' },
    { pattern: /ENEL|CPFL|SABESP|LIGHT|VIVO|CLARO|TIM|NET SERVICOS|INTERNET/i, nameMatch: 'Contas & Serviços (Luz/Internet)' },
    { pattern: /FARMACIA|DROGASIL|DROGA RAIA|PAGUE MENOS|HOSPITAL|CONSULTORIO/i, nameMatch: 'Saúde & Farmácia' },
    { pattern: /NETFLIX|SPOTIFY|AMAZON PRIME|HBO|DISNEY|APPLE\.COM|GOOGLE STORAGE/i, nameMatch: 'Assinaturas & Softwares' },
    { pattern: /CINEMA|INGRESSO|HOTEL|BOOKING|AIRBNB|GOL LINHAS|LATAM|AZUL/i, nameMatch: 'Lazer, Viagens & Hobbies' },
    { pattern: /ALUGUEL|CONDOMINIO|QUANTO ANDAR|IMOBILIARIA/i, nameMatch: 'Moradia (Aluguel/Condomínio)' },
    { pattern: /SALARIO|FOLHA DE PAGAMENTO|TED RECEBIDA DE EMPRESA/i, nameMatch: 'Salário & Renda' },
    { pattern: /TESOURO|CDB|LCI|LCA|INVESTIMENTO|XP INVESTIMENTOS|BTG PACTUAL/i, nameMatch: 'Aportes & Investimentos' },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(desc)) {
      const found = allCategories.find((c) => c.name.toLowerCase().includes(rule.nameMatch.toLowerCase()));
      if (found) return found.id;
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();

    const body = await request.json().catch(() => ({}));
    const { itemId } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required for sync' }, { status: 400 });
    }

    const allCategories = await db.select().from(categories);

    // 1. Fetch Accounts from Pluggy
    const pluggyAccounts = await getPluggyAccounts(itemId);
    let accountsSynced = 0;
    let transactionsSynced = 0;

    for (const pAcc of pluggyAccounts) {
      const internalAccId = `pluggy-acc-${pAcc.id}`;
      
      // Determine account type mapping
      let accType = 'CHECKING';
      if (pAcc.type === 'CREDIT') accType = 'CREDIT_CARD';
      else if (pAcc.type === 'SAVINGS') accType = 'SAVINGS';
      else if (pAcc.type === 'INVESTMENT') accType = 'INVESTMENT';

      // Upsert account
      const existing = await db.select().from(accounts).where(eq(accounts.id, internalAccId));
      if (existing.length > 0) {
        await db.update(accounts).set({
          name: pAcc.name || pAcc.marketingName || 'Conta Bancária',
          balance: pAcc.balance || 0,
          type: accType,
          updatedAt: new Date().toISOString(),
        }).where(eq(accounts.id, internalAccId));
      } else {
        await db.insert(accounts).values({
          id: internalAccId,
          name: pAcc.name || pAcc.marketingName || 'Conta Bancária',
          type: accType,
          balance: pAcc.balance || 0,
          currencyCode: pAcc.currencyCode || 'BRL',
          pluggyItemId: itemId,
          pluggyAccountId: pAcc.id,
          institutionName: pAcc.bankData?.institutionName || 'Banco Conectado',
          color: '#10b981',
          updatedAt: new Date().toISOString(),
        });
      }
      accountsSynced++;

      // 2. Fetch Transactions for this account
      const pTxs = await getPluggyTransactions({ accountId: pAcc.id, pageSize: 50 });
      for (const pTx of pTxs) {
        const txId = `pluggy-tx-${pTx.id}`;
        const existingTx = await db.select().from(transactions).where(eq(transactions.id, txId));

        if (existingTx.length === 0) {
          const matchedCategory = matchCategoryByRule(pTx.description || '', allCategories);
          
          await db.insert(transactions).values({
            id: txId,
            accountId: internalAccId,
            categoryId: matchedCategory,
            description: pTx.description || 'Transação Open Finance',
            amount: pTx.amount || 0,
            date: pTx.date ? pTx.date.split('T')[0] : new Date().toISOString().split('T')[0],
            type: pTx.amount < 0 ? 'DEBIT' : 'CREDIT',
            status: pTx.status || 'SETTLED',
            pluggyTransactionId: pTx.id,
            createdAt: new Date().toISOString(),
          });
          transactionsSynced++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      accountsSynced,
      transactionsSynced,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error during Pluggy sync:', error);
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}
