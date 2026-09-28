import { z } from 'zod'
import type { LoginCredentials, AuthSession } from '@/contracts/auth'
import type { BankingFetch } from './bankingApi'
import { customerResponseSchema } from './bankingResponseSchemas'
import { ApiError } from './apiError'

const schema = z.object({ customer: customerResponseSchema.nullable(), csrfToken: z.string() })

export function createAuthApi(fetcher: BankingFetch) {
  async function request(
    path: string,
    csrfToken?: string,
    body?: LoginCredentials,
  ): Promise<AuthSession> {
    const response = await fetcher(`/api/auth/${path}`, {
      method: path === 'session' ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data: unknown = await response.json()
    if (!response.ok) {
      const failure = z
        .object({ error: z.object({ code: z.string(), message: z.string() }) })
        .safeParse(data)
      throw new ApiError(
        response.status,
        failure.success ? failure.data.error.code : 'AUTH_FAILED',
        failure.success ? failure.data.error.message : 'Authentication failed. Please try again.',
      )
    }
    const result = schema.safeParse(data)
    if (!result.success)
      throw new ApiError(502, 'INVALID_RESPONSE', 'The session could not be verified.')
    return result.data
  }
  return {
    session: () => request('session'),
    login: (body: LoginCredentials, csrf: string) => request('login', csrf, body),
    logout: (csrf: string) => request('logout', csrf),
  }
}
