import { describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { selectCustomerAccounts } from '../../use-cases/accounts/selectCustomerAccounts'
import type { BankingState } from '../../use-cases/ports/BankingRepository'
import {
  BANKING_DATABASE_NAME,
  BANKING_OBJECT_STORE,
  BANKING_STATE_KEY,
  createIndexedDbBankingRepository,
} from '../../data/repositories/indexedDbBankingRepository'
import { persistedBankingStateSchema } from '../../data/repositories/bankingStateSchema'
import { createSeedState, SEED_OPENING_BALANCES } from '../../data/seed/createSeedState'

const persisted = (state: BankingState) => ({ ...state, schemaVersion: 1 as const })

function fixture() {
  const factory = new IDBFactory()
  const repository = createIndexedDbBankingRepository(() => factory)
  async function raw(
    operation: 'read' | 'write',
    value?: unknown,
    key = BANKING_STATE_KEY,
  ): Promise<unknown> {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(BANKING_DATABASE_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(BANKING_OBJECT_STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(
          BANKING_OBJECT_STORE,
          operation === 'read' ? 'readonly' : 'readwrite',
        )
        const store = transaction.objectStore(BANKING_OBJECT_STORE)
        const request = operation === 'read' ? store.get(key) : store.put(value, key)
        transaction.oncomplete = () => resolve(request.result)
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      database.close()
    }
  }
  return { factory, repository, raw }
}

describe('deterministic banking seed', () => {
  it('is stable across clock changes and never uses randomness', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Unexpected randomness')
    })
    const before = createSeedState()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2040-01-01T00:00:00Z'))
      expect(createSeedState()).toEqual(before)
      expect(random).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('has the requested shape, variety and valid references', () => {
    const state = createSeedState()
    expect(persistedBankingStateSchema.safeParse(persisted(state)).success).toBe(true)
    expect(state.accounts).toHaveLength(6)
    expect(state.beneficiaries).toHaveLength(6)
    expect(state.transactions).toHaveLength(100)
    expect(state.transfers).toHaveLength(6)
    expect(new Set(state.transactions.map((entry) => entry.occurredAt.slice(0, 7))).size).toBe(6)
    expect(new Set(state.transactions.map((entry) => entry.type)).size).toBe(5)
    expect(new Set(state.transactions.map((entry) => entry.status)).size).toBe(3)
    expect(new Set(state.transactions.map((entry) => entry.direction)).size).toBe(2)
  })

  it('reconciles every balance with opening balances and completed activity only', () => {
    const state = createSeedState()
    for (const account of state.accounts) {
      const net = state.transactions
        .filter((entry) => entry.accountId === account.id && entry.status === 'COMPLETED')
        .reduce(
          (sum, entry) =>
            sum + (entry.direction === 'CREDIT' ? entry.amountMinor : -entry.amountMinor),
          0,
        )
      expect(account.balanceMinor).toBe(SEED_OPENING_BALANCES[account.id]! + net)
    }
    expect(state.accounts.map((account) => account.balanceMinor)).toEqual([
      1_375_105, 1_661_100, 41_400, 200_000, 175_000, 0,
    ])
  })

  it('keeps internal recipients out of customer account lists and ID searches', () => {
    const state = createSeedState()
    const owned = selectCustomerAccounts(state)
    expect(owned.map((account) => [account.type, account.status])).toEqual([
      ['CHECKING', 'ACTIVE'],
      ['SAVINGS', 'ACTIVE'],
      ['CHECKING', 'FROZEN'],
    ])
    expect(owned.find((account) => account.id === 'account-internal-alex')).toBeUndefined()
    owned[0]!.balanceMinor = 0
    expect(state.accounts[0]!.balanceMinor).not.toBe(0)
  })

  it('returns independent seed instances', () => {
    const state = createSeedState()
    state.accounts[0]!.balanceMinor = 0
    const destination = state.transfers[0]!.destination
    if (destination.kind !== 'EXTERNAL_ACCOUNT') destination.accountId = 'changed'
    state.beneficiaries.length = 0
    expect(createSeedState().accounts[0]!.balanceMinor).not.toBe(0)
    expect(createSeedState().beneficiaries).toHaveLength(6)
    expect(createSeedState().transfers[0]!.destination).toEqual({
      kind: 'OWN_ACCOUNT',
      accountId: 'account-savings',
    })
  })
})

describe('IndexedDB repository', () => {
  it('initializes absent state once and preserves unrelated records', async () => {
    const { repository, raw } = fixture()
    await raw('write', 'keep', 'unrelated')
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    expect(await repository.load()).toEqual(createSeedState())
    expect(put).toHaveBeenCalledTimes(1)
    await repository.load()
    expect(put).toHaveBeenCalledTimes(1)
    expect(await raw('read', undefined, 'unrelated')).toBe('keep')
  })

  it('loads committed updates without rewriting across repository instances', async () => {
    const { repository, factory } = fixture()
    const state = await repository.update((current) => {
      current.accounts[0]!.displayName = 'My spending account'
      return current
    })
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    const reopened = createIndexedDbBankingRepository(() => factory)
    expect(await reopened.load()).toEqual(state)
    expect(put).not.toHaveBeenCalled()
  })

  it('isolates loaded, callback and committed snapshots', async () => {
    const { repository } = fixture()
    const loaded = await repository.load()
    loaded.accounts[0]!.displayName = 'Unsaved'
    expect((await repository.load()).accounts[0]!.displayName).toBe('Everyday Checking')
    let callbackState: BankingState | undefined
    const saved = await repository.update((current) => {
      callbackState = current
      current.accounts[0]!.displayName = 'Saved'
      return current
    })
    callbackState!.accounts[0]!.displayName = 'Changed after commit'
    saved.accounts[0]!.displayName = 'Another unsaved change'
    expect((await repository.load()).accounts[0]!.displayName).toBe('Saved')
  })

  it.each(['{broken', '', null, [], {}, { ...createSeedState(), schemaVersion: 2 }])(
    'recovers invalid payload (%j)',
    async (value) => {
      const { repository, raw } = fixture()
      await raw('write', value)
      expect(await repository.load()).toEqual(createSeedState())
      expect(await raw('read')).toEqual(persisted(createSeedState()))
    },
  )

  it('restores the exact seed state after updates and repeated resets', async () => {
    const { repository, raw } = fixture()
    await repository.load()
    const original = await raw('read')
    await repository.update((current) => {
      current.accounts[0]!.displayName = 'Changed'
      return current
    })
    expect(await repository.reset()).toEqual(createSeedState())
    expect(await raw('read')).toEqual(original)
    expect(await repository.reset()).toEqual(createSeedState())
  })

  it('does not lose concurrent changes from independent connections', async () => {
    const { repository, factory } = fixture()
    const initial = await repository.load()
    const other = createIndexedDbBankingRepository(() => factory)
    const seen: number[] = []
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? repository : other).update((current) => {
          seen.push(current.accounts[0]!.balanceMinor)
          current.accounts[0]!.balanceMinor += 1
          return current
        }),
      ),
    )
    expect(new Set(seen).size).toBe(12)
    expect((await repository.load()).accounts[0]!.balanceMinor).toBe(
      initial.accounts[0]!.balanceMinor + 12,
    )
  })

  it('keeps a concurrent first load from overwriting an initializing update', async () => {
    const { repository, factory } = fixture()
    const other = createIndexedDbBankingRepository(() => factory)
    await Promise.all([
      repository.load(),
      other.update((current) => {
        current.accounts[0]!.displayName = 'Committed'
        return current
      }),
      repository.load(),
    ])
    expect((await other.load()).accounts[0]!.displayName).toBe('Committed')
  })

  it('resolves only after the transaction completes', async () => {
    const { repository } = fixture()
    await repository.load()
    let completed = false
    const originalPut = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      this.transaction.addEventListener('complete', () => {
        completed = true
      })
      return originalPut.apply(this, args)
    })
    await repository.reset()
    expect(completed).toBe(true)
  })

  it('rolls back callback mutations and preserves the original domain error', async () => {
    const { repository, raw } = fixture()
    const before = await repository.load()
    const failure = new Error('Domain validation failed')
    await expect(
      repository.update((current) => {
        current.accounts[0]!.balanceMinor = 1
        current.transactions.length = 0
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(await raw('read')).toEqual(persisted(before))
  })

  it('rejects an async callback before writing', async () => {
    const { repository, raw } = fixture()
    const before = await repository.load()
    // Deliberately violate the TypeScript contract to check the runtime boundary.
    // @ts-expect-error update callbacks must be synchronous
    await expect(repository.update(async (current) => current)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    })
    expect(await raw('read')).toEqual(persisted(before))
  })

  it('surfaces an unavailable factory without falling back to another store', async () => {
    const repository = createIndexedDbBankingRepository(() => {
      throw new Error('SecurityError')
    })
    await expect(repository.load()).rejects.toMatchObject({ code: 'STORAGE_OPEN_FAILED' })
    await expect(repository.reset()).rejects.toMatchObject({ code: 'STORAGE_OPEN_FAILED' })
  })

  it('rejects a newer database version without deleting its data', async () => {
    const { repository, factory } = fixture()
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(BANKING_DATABASE_NAME, 2)
      request.onupgradeneeded = () =>
        request.result.createObjectStore(BANKING_OBJECT_STORE).put('future-data', BANKING_STATE_KEY)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
    await expect(repository.load()).rejects.toMatchObject({ code: 'STORAGE_OPEN_FAILED' })
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(BANKING_DATABASE_NAME, 2)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction(BANKING_OBJECT_STORE)
        const read = transaction.objectStore(BANKING_OBJECT_STORE).get(BANKING_STATE_KEY)
        transaction.oncomplete = () => {
          database.close()
          expect(read.result).toBe('future-data')
          resolve()
        }
        transaction.onabort = () => {
          database.close()
          reject(transaction.error)
        }
      }
      request.onerror = () => reject(request.error)
    })
  })

  it('does not reset after a read error', async () => {
    const { repository, raw } = fixture()
    const before = await repository.load()
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      throw new DOMException('Read denied', 'UnknownError')
    })
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    await expect(repository.load()).rejects.toMatchObject({ code: 'STORAGE_READ_FAILED' })
    expect(put).not.toHaveBeenCalled()
    get.mockRestore()
    expect(await raw('read')).toEqual(persisted(before))
  })

  it.each(['update', 'reset'] as const)(
    'preserves state when %s hits a write/quota failure',
    async (operation) => {
      const { repository, raw } = fixture()
      const before = await repository.update((current) => {
        current.accounts[0]!.displayName = 'Saved'
        return current
      })
      const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      })
      await expect(
        operation === 'reset'
          ? repository.reset()
          : repository.update((current) => {
              current.accounts[0]!.displayName = 'Unsaved'
              return current
            }),
      ).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' })
      put.mockRestore()
      expect(await raw('read')).toEqual(persisted(before))
    },
  )

  it('rolls back a successful write request if the transaction later aborts', async () => {
    const { repository, raw } = fixture()
    const before = await repository.load()
    const originalPut = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = originalPut.apply(this, args)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(
      repository.update((current) => {
        current.accounts[0]!.balanceMinor = 1
        return current
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' })
    put.mockRestore()
    expect(await raw('read')).toEqual(persisted(before))
  })

  it.each([undefined, '{broken'])(
    'does not claim recovery when writing the seed fails (%j)',
    async (value) => {
      const { repository, raw } = fixture()
      if (value !== undefined) await raw('write', value)
      const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      })
      await expect(repository.load()).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' })
      put.mockRestore()
      expect(await raw('read')).toEqual(value)
    },
  )

  it('closes each completed connection so a later upgrade is not blocked', async () => {
    const { repository, factory } = fixture()
    await repository.load()
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(BANKING_DATABASE_NAME, 2)
      request.onblocked = () => reject(new Error('Connection was left open'))
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  })

  it('reports a missing object store without silently recreating the database', async () => {
    const { repository, factory } = fixture()
    await new Promise<void>((resolve) => {
      const request = factory.open(BANKING_DATABASE_NAME, 1)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })
    await expect(repository.load()).rejects.toMatchObject({ code: 'STORAGE_OPEN_FAILED' })
  })
  const invalidStates: [string, (state: BankingState) => void][] = [
    [
      'negative balance',
      (state) => {
        state.accounts[0]!.balanceMinor = -1
      },
    ],
    [
      'unsafe amount',
      (state) => {
        state.transactions[0]!.amountMinor = Number.MAX_SAFE_INTEGER + 1
      },
    ],
    [
      'fractional amount',
      (state) => {
        state.transactions[0]!.amountMinor = 1.5
      },
    ],
    [
      'duplicate ID',
      (state) => {
        state.accounts.push({ ...state.accounts[0]! })
      },
    ],
    [
      'unknown account',
      (state) => {
        state.transactions[0]!.accountId = 'missing'
      },
    ],
    [
      'unknown transfer',
      (state) => {
        state.transactions[0]!.transferId = 'missing'
      },
    ],
    [
      'missing linked credit',
      (state) => {
        state.transactions = state.transactions.filter(
          (entry) => entry.id !== 'seed-transfer-03-credit',
        )
      },
    ],
    [
      'mismatched linked amount',
      (state) => {
        state.transactions.find((entry) => entry.id === 'seed-transfer-03-credit')!.amountMinor = 1
      },
    ],
    [
      'duplicate idempotency key',
      (state) => {
        state.transfers[1]!.idempotencyKey = state.transfers[0]!.idempotencyKey
      },
    ],
    [
      'invalid destination ownership',
      (state) => {
        state.transfers[0]!.destination = {
          kind: 'OWN_ACCOUNT',
          accountId: 'account-internal-alex',
        }
      },
    ],
    [
      'foreign beneficiary',
      (state) => {
        state.beneficiaries[0]!.customerId = 'another-customer'
      },
    ],
    [
      'invalid internal beneficiary',
      (state) => {
        state.beneficiaries[0]!.internalAccountId = 'missing'
      },
    ],
    [
      'invalid timestamp',
      (state) => {
        state.transactions[0]!.occurredAt = 'yesterday'
      },
    ],
  ]
  it.each(invalidStates)(
    'rejects %s before writing; repairs persisted corruption',
    async (_name, mutate) => {
      const { repository, raw } = fixture()
      const before = await repository.load()
      const put = vi.spyOn(IDBObjectStore.prototype, 'put')
      await expect(
        repository.update((current) => {
          mutate(current)
          return current
        }),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' })
      expect(put).not.toHaveBeenCalled()
      expect(await raw('read')).toEqual(persisted(before))
      const invalid = structuredClone(before)
      mutate(invalid)
      await raw('write', invalid)
      expect(await repository.load()).toEqual(createSeedState())
    },
  )
})
