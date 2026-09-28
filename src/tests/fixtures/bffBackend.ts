import { randomBytes } from 'node:crypto'
import { getRequestURL, type H3Event } from 'h3'
import { AuthFailure } from '../../../server/lib/authFailure'
import { readJsonBody } from '../../../server/utils/http'
import type { BffBackend, BffTokens } from '../../../server/utils/bffBackend'

const customers = {
  'customer-taylor': {
    id: 'customer-taylor',
    firstName: 'Taylor',
    lastName: 'Morgan',
    displayName: 'Taylor Morgan',
  },
  'customer-alex': {
    id: 'customer-alex',
    firstName: 'Alex',
    lastName: 'Rivera',
    displayName: 'Alex Rivera',
  },
} as const

export function createTestBffBackend(now = Date.now): BffBackend {
  const grants = new Map<string, BffTokens & { absoluteExpiry: number }>()
  const access = new Map<string, string>()
  const balances = new Map([
    ['customer-taylor', 100_000],
    ['customer-alex', 200_000],
  ])
  const transfers = new Map<string, Record<string, unknown>>()

  function revoke(refreshToken: string) {
    const grant = grants.get(refreshToken)
    if (grant) access.delete(grant.accessToken)
    grants.delete(refreshToken)
  }
  function issue(customerId: keyof typeof customers, absoluteExpiry = now() + 8 * 60 * 60_000) {
    const value = {
      customerId,
      absoluteExpiry,
      accessToken: randomBytes(32).toString('hex'),
      refreshToken: randomBytes(32).toString('hex'),
      expiresAt: now() + 5 * 60_000,
    }
    grants.set(value.refreshToken, value)
    access.set(value.accessToken, value.refreshToken)
    return value
  }
  function authenticate(authorization: string) {
    const token = /^Bearer ([a-f0-9]{64})$/.exec(authorization)?.[1]
    const refreshToken = token ? access.get(token) : undefined
    const grant = refreshToken ? grants.get(refreshToken) : undefined
    if (!grant || grant.expiresAt <= now() || grant.absoluteExpiry <= now())
      throw new AuthFailure(401, 'TOKEN_INVALID', 'Please sign in again.')
    return grant.customerId as keyof typeof customers
  }

  return {
    async login(email, password) {
      const customerId =
        email === 'taylor@example.com'
          ? 'customer-taylor'
          : email === 'alex@example.com'
            ? 'customer-alex'
            : undefined
      if (!customerId || password !== 'DemoBank!2026')
        throw new AuthFailure(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
      return issue(customerId)
    },
    async refresh(refreshToken) {
      const grant = grants.get(refreshToken)
      if (!grant || grant.absoluteExpiry <= now()) {
        revoke(refreshToken)
        throw new AuthFailure(401, 'TOKEN_INVALID', 'Please sign in again.')
      }
      revoke(refreshToken)
      return issue(grant.customerId as keyof typeof customers, grant.absoluteExpiry)
    },
    revoke,
    async identity(accessToken) {
      return customers[authenticate(`Bearer ${accessToken}`)]
    },
    async request(event: H3Event, authorization: string, assertSessionActive: () => void) {
      const customerId = authenticate(authorization)
      const path = getRequestURL(event).pathname
      assertSessionActive()
      if (event.method === 'GET' && path === '/api/accounts')
        return [
          {
            id: customerId === 'customer-taylor' ? 'account-checking' : 'alex-account-checking',
            ownerId: customerId,
            balanceMinor: balances.get(customerId),
          },
          {
            id: customerId === 'customer-taylor' ? 'account-savings' : 'alex-account-savings',
            ownerId: customerId,
            balanceMinor: 50_000,
          },
        ]
      if (event.method === 'GET' && path.startsWith('/api/accounts/'))
        throw new AuthFailure(404, 'ACCOUNT_NOT_FOUND', 'Account not found.')
      if (event.method === 'POST' && path === '/api/transfers') {
        const request = (await readJsonBody(event)) as {
          idempotencyKey: string
          amountMinor: number
        }
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(request)))
        assertSessionActive()
        const key = `${customerId}:${request.idempotencyKey}`
        const previous = transfers.get(key)
        if (previous) return previous
        balances.set(customerId, balances.get(customerId)! - request.amountMinor)
        const result = {
          id: randomBytes(8).toString('hex'),
          status: 'COMPLETED',
          amountMinor: request.amountMinor,
        }
        transfers.set(key, result)
        return result
      }
      throw new AuthFailure(404, 'NOT_FOUND', 'Endpoint not found.')
    },
  }
}
