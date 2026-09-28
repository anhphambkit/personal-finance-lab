import { getRequestURL, setResponseHeader, setResponseStatus } from 'h3'
import { readJsonBody } from './http'
import { AuthFailure } from '../lib/authFailure'
import type { BffBackend, BffTokens } from './bffBackend'

function validatedBaseUrl(input: string) {
  const value = new URL(input)
  if (!['http:', 'https:'].includes(value.protocol) || value.search || value.hash)
    throw new Error('NUXT_BFF_API_BASE_URL must be an HTTP(S) URL without query or hash.')
  if (value.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(value.hostname))
    throw new Error('NUXT_BFF_API_BASE_URL requires HTTPS outside loopback.')
  return value.href.replace(/\/$/, '')
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new AuthFailure(502, 'INVALID_RESPONSE', 'The banking service returned invalid JSON.')
  }
}

function failure(response: Response, body: unknown) {
  const error =
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object'
      ? body.error
      : undefined
  const code =
    error && 'code' in error && typeof error.code === 'string' ? error.code : 'UPSTREAM_ERROR'
  const message =
    error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'The banking service could not complete the request.'
  return new AuthFailure(response.status, code, message)
}

function tokens(value: unknown): BffTokens {
  if (
    !value ||
    typeof value !== 'object' ||
    !('accessToken' in value) ||
    typeof value.accessToken !== 'string' ||
    !('refreshToken' in value) ||
    typeof value.refreshToken !== 'string' ||
    !('expiresAt' in value) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isSafeInteger(value.expiresAt) ||
    !('customerId' in value) ||
    typeof value.customerId !== 'string'
  )
    throw new AuthFailure(
      502,
      'INVALID_RESPONSE',
      'The authentication response could not be verified.',
    )
  return value as BffTokens
}

function customer(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('firstName' in value) ||
    typeof value.firstName !== 'string' ||
    !('lastName' in value) ||
    typeof value.lastName !== 'string' ||
    !('displayName' in value) ||
    typeof value.displayName !== 'string'
  )
    throw new AuthFailure(502, 'INVALID_RESPONSE', 'The customer response could not be verified.')
  return {
    id: value.id,
    firstName: value.firstName,
    lastName: value.lastName,
    displayName: value.displayName,
  }
}

/** Server-to-server adapter. Backend credentials never enter the browser response. */
export function createBffHttpBackend(baseUrl: string): BffBackend {
  const base = validatedBaseUrl(baseUrl)
  async function auth(path: string, body: unknown, allowNoContent = false) {
    let response: Response
    try {
      response = await fetch(`${base}/auth/${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new AuthFailure(503, 'SERVICE_UNAVAILABLE', 'The banking service is unavailable.')
    }
    if (allowNoContent && response.status === 204) return undefined
    const data = await responseJson(response)
    if (!response.ok) throw failure(response, data)
    return data
  }
  return {
    async login(email, password) {
      return tokens(await auth('login', { email, password }))
    },
    async refresh(refreshToken) {
      return tokens(await auth('refresh', { refreshToken }))
    },
    async revoke(refreshToken) {
      await auth('logout', { refreshToken }, true)
    },
    async identity(accessToken) {
      let response: Response
      try {
        response = await fetch(`${base}/customer`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        })
      } catch {
        throw new AuthFailure(503, 'SERVICE_UNAVAILABLE', 'The banking service is unavailable.')
      }
      const data = await responseJson(response)
      if (!response.ok) throw failure(response, data)
      return customer(data)
    },
    async request(event, authorization, assertSessionActive) {
      assertSessionActive()
      const incoming = getRequestURL(event)
      const relative = incoming.pathname.slice('/api/'.length)
      const body = event.method === 'POST' ? JSON.stringify(await readJsonBody(event)) : undefined
      assertSessionActive()
      let response: Response
      try {
        response = await fetch(`${base}/${relative}${incoming.search}`, {
          method: event.method,
          headers: {
            Accept: 'application/json',
            Authorization: authorization,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        })
      } catch {
        throw new AuthFailure(503, 'SERVICE_UNAVAILABLE', 'The banking service is unavailable.')
      }
      const data = response.status === 204 ? undefined : await responseJson(response)
      assertSessionActive()
      setResponseStatus(event, response.status)
      setResponseHeader(event, 'cache-control', 'private, no-store')
      return data
    },
  }
}
