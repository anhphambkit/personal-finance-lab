import { DEMO_NEW_SAME_BANK_NUMBER } from '../../shared/config/demoRecipients'
import type { BankingState } from '../../use-cases/ports/BankingRepository'
import type { Account } from '../../domain/accounts/account'
import type { Transaction } from '../../domain/transactions/transaction'
import { creditBalance, debitBalance } from '../../domain/money/money'

export const SEED_OPENING_BALANCES: Readonly<Record<string, number>> = Object.freeze({
  'account-checking': 250_000,
  'account-savings': 1_200_000,
  'account-frozen': 42_000,
  'account-internal-alex': 200_000,
  'account-internal-jamie': 175_000,
  'account-internal-jordan': 0,
})

/** Additive demo fixture, also used to upgrade existing local snapshots. */
export function createNewDemoRecipientAccount(): Account {
  return {
    id: 'account-internal-jordan',
    ownerId: 'customer-jordan',
    displayName: 'Jordan Lee',
    type: 'CHECKING',
    accountNumber: DEMO_NEW_SAME_BANK_NUMBER,
    status: 'ACTIVE',
    currency: 'USD',
    balanceMinor: 0,
    createdAt: '2025-01-15T09:00:00.000Z',
  }
}

/** Fixed fictional fixture; returns fresh objects and never reads the clock or storage. */
export function createSeedState(): BankingState {
  const customer = {
    id: 'customer-taylor',
    firstName: 'Taylor',
    lastName: 'Morgan',
    displayName: 'Taylor Morgan',
  }
  const account = (
    id: string,
    ownerId: string,
    displayName: string,
    type: Account['type'],
    accountNumber: string,
    status: Account['status'] = 'ACTIVE',
  ): Account => ({
    id,
    ownerId,
    displayName,
    type,
    accountNumber,
    status,
    currency: 'USD',
    balanceMinor: SEED_OPENING_BALANCES[id] ?? 0,
    createdAt: '2025-01-15T09:00:00.000Z',
  })
  const state: BankingState = {
    customer,
    accounts: [
      account('account-checking', customer.id, 'Everyday Checking', 'CHECKING', '100000004821'),
      account('account-savings', customer.id, 'Rainy Day Savings', 'SAVINGS', '100000007305'),
      account(
        'account-frozen',
        customer.id,
        'Travel Reserve',
        'CHECKING',
        '100000009614',
        'FROZEN',
      ),
      account('account-internal-alex', 'customer-alex', 'Alex Rivera', 'CHECKING', '200000001842'),
      account('account-internal-jamie', 'customer-jamie', 'Jamie Park', 'SAVINGS', '200000006027'),
      createNewDemoRecipientAccount(),
    ],
    transactions: [],
    transfers: [],
    beneficiaries: [
      {
        id: 'beneficiary-alex',
        customerId: customer.id,
        displayName: 'Alex Rivera',
        bankName: 'Raksul-bank',
        accountNumber: '200000001842',
        currency: 'USD',
        internalAccountId: 'account-internal-alex',
      },
      {
        id: 'beneficiary-jamie',
        customerId: customer.id,
        displayName: 'Jamie Park',
        bankName: 'Raksul-bank',
        accountNumber: '200000006027',
        currency: 'USD',
        internalAccountId: 'account-internal-jamie',
      },
      {
        id: 'beneficiary-rent',
        customerId: customer.id,
        displayName: 'Maple Apartments',
        bankName: 'Harbor Bank',
        accountNumber: '300000002106',
        currency: 'USD',
      },
      {
        id: 'beneficiary-sam',
        customerId: customer.id,
        displayName: 'Sam Morgan',
        bankName: 'Cedar Credit Union',
        accountNumber: '300000005732',
        currency: 'USD',
      },
      {
        id: 'beneficiary-energy',
        customerId: customer.id,
        displayName: 'City Energy',
        bankName: 'Harbor Bank',
        accountNumber: '300000008194',
        currency: 'USD',
      },
      {
        id: 'beneficiary-club',
        customerId: customer.id,
        displayName: 'Community Sports Club',
        bankName: 'Summit Bank',
        accountNumber: '300000009508',
        currency: 'USD',
      },
    ],
  }
  type ActivityTemplate = [
    day: number,
    accountId: string,
    direction: Transaction['direction'],
    type: Transaction['type'],
    amountMinor: number,
    description: string,
    counterparty: string,
  ]
  const activity: ActivityTemplate[] = [
    [1, 'account-checking', 'CREDIT', 'TRANSFER', 450_000, 'Monthly salary', 'Northstar Studio'],
    [2, 'account-checking', 'DEBIT', 'TRANSFER', 140_000, 'Apartment rent', 'Maple Apartments'],
    [4, 'account-checking', 'DEBIT', 'TRANSFER', 12_480, 'Electricity and water', 'City Energy'],
    [6, 'account-checking', 'DEBIT', 'CARD', 8_735, 'Weekly groceries', 'Green Basket'],
    [8, 'account-checking', 'DEBIT', 'CARD', 650, 'Morning coffee', 'Oak Coffee'],
    [10, 'account-checking', 'DEBIT', 'CARD', 4_500, 'Monthly transit pass', 'Metro Transit'],
    [12, 'account-checking', 'DEBIT', 'CARD', 2_185, 'Pharmacy purchase', 'Well Pharmacy'],
    [14, 'account-checking', 'DEBIT', 'CARD', 3_299, 'Books and stationery', 'Page & Paper'],
    [16, 'account-checking', 'CREDIT', 'CARD', 1_499, 'Returned item refund', 'Page & Paper'],
    [18, 'account-checking', 'DEBIT', 'CASH', 10_000, 'ATM cash withdrawal', 'Raksul-bank ATM'],
    [18, 'account-checking', 'DEBIT', 'FEE', 250, 'Out-of-network ATM fee', 'Raksul-bank'],
    [20, 'account-checking', 'DEBIT', 'CARD', 6_420, 'Dinner with friends', 'Juniper Kitchen'],
    [28, 'account-savings', 'CREDIT', 'INTEREST', 1_850, 'Monthly savings interest', 'Raksul-bank'],
    [28, 'account-frozen', 'DEBIT', 'FEE', 100, 'Reserve account service fee', 'Raksul-bank'],
  ]
  for (let month = 3; month <= 8; month++) {
    const monthText = String(month).padStart(2, '0')
    const occurredAt = (day: number) =>
      `2026-${monthText}-${String(day).padStart(2, '0')}T10:00:00.000Z`
    activity.forEach(
      ([day, accountId, direction, type, baseAmount, description, counterparty], index) => {
        state.transactions.push({
          id: `seed-${monthText}-${String(index + 1).padStart(2, '0')}`,
          accountId,
          direction,
          type,
          amountMinor: baseAmount + (type === 'CARD' ? (month - 3) * 37 : 0),
          currency: 'USD',
          status: 'COMPLETED',
          description,
          counterparty,
          occurredAt: occurredAt(day),
        })
      },
    )
    const transferId = `seed-transfer-${monthText}`
    state.transfers.push({
      id: transferId,
      idempotencyKey: `seed-savings-${monthText}`,
      requestHash: `seed:v1:savings:2026-${monthText}:75000`,
      sourceAccountId: 'account-checking',
      destination: { kind: 'OWN_ACCOUNT', accountId: 'account-savings' },
      amountMinor: 75_000,
      currency: 'USD',
      reference: 'Monthly savings',
      status: 'COMPLETED',
      createdAt: occurredAt(25),
      completedAt: occurredAt(25),
    })
    for (const direction of ['DEBIT', 'CREDIT'] as const) {
      state.transactions.push({
        id: `${transferId}-${direction.toLowerCase()}`,
        transferId,
        accountId: direction === 'DEBIT' ? 'account-checking' : 'account-savings',
        direction,
        type: 'TRANSFER',
        amountMinor: 75_000,
        currency: 'USD',
        status: 'COMPLETED',
        description: 'Monthly savings',
        counterparty: direction === 'DEBIT' ? 'Rainy Day Savings' : 'Everyday Checking',
        occurredAt: occurredAt(25),
      })
    }
  }
  for (const [index, status] of (['PENDING', 'FAILED', 'PENDING', 'FAILED'] as const).entries()) {
    state.transactions.push({
      id: `seed-unsettled-${index + 1}`,
      accountId: index < 2 ? 'account-checking' : 'account-frozen',
      direction: 'DEBIT',
      type: 'CARD',
      amountMinor: 2_400 + index * 500,
      currency: 'USD',
      status,
      description: status === 'PENDING' ? 'Hotel authorization' : 'Declined card purchase',
      counterparty: status === 'PENDING' ? 'Lakeside Hotel' : 'Travel Supply',
      occurredAt: `2026-08-${29 + (index % 2)}T15:00:00.000Z`,
    })
  }
  state.transactions.sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
  )
  for (const entry of state.transactions) {
    if (entry.status !== 'COMPLETED') continue
    const target = state.accounts.find((item) => item.id === entry.accountId)
    if (!target) throw new Error('Seed references an unknown account.')
    target.balanceMinor =
      entry.direction === 'CREDIT'
        ? creditBalance(target.balanceMinor, entry.amountMinor)
        : debitBalance(target.balanceMinor, entry.amountMinor)
  }
  return state
}
