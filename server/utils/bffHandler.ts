import { randomBytes, timingSafeEqual } from 'node:crypto'
import { getCookie, getRequestHeader, getRequestURL, setCookie, type H3Event } from 'h3'
import { AuthFailure } from '../lib/authFailure'
import type { BffTokens, BffBackend } from './bffBackend'
import { readJsonBody, httpErrorResponse } from './http'
import { setResponseHeader } from 'h3'
import { z } from 'zod'
import type { Customer } from '../../src/domain/customers/customer'

const cookieName = 'personal-finance-lab-bff-session'
const idleMs = 30 * 60_000
const absoluteMs = 8 * 60 * 60_000
const anonymousMs = 10 * 60_000
const maxAuthenticatedSessions = 2_000
const maxAnonymousSessions = 512
interface Session {
  token: string
  csrfToken: string
  customerId: string | null
  created: number
  touched: number
  backendTokens?: BffTokens
  customer?: Customer
  refreshing?: Promise<void>
  closing?: boolean
}
/** Browser sessions contain no upstream credentials; the backend stays behind Nitro. */
export function createBffHandler({
  now = Date.now,
  trustedOrigin = '',
  backend,
}: {
  backend: BffBackend
  now?: () => number
  trustedOrigin?: string
}) {
  if (trustedOrigin) {
    const configured = new URL(trustedOrigin)
    if (!['http:', 'https:'].includes(configured.protocol) || configured.origin !== trustedOrigin)
      throw new Error('NUXT_AUTH_ORIGIN must be an HTTP(S) origin without a path.')
    if (
      configured.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)
    )
      throw new Error('NUXT_AUTH_ORIGIN requires HTTPS outside loopback.')
  }
  function origin(event: H3Event) {
    if (trustedOrigin) return trustedOrigin
    const request = getRequestURL(event, { xForwardedHost: false, xForwardedProto: false })
    if (!['localhost', '127.0.0.1', '[::1]'].includes(request.hostname))
      throw new AuthFailure(
        503,
        'AUTH_NOT_CONFIGURED',
        'Configure the public authentication origin.',
      )
    return request.origin
  }
  const sessions = new Map<string, Session>()
  const attempts = new Map<string, { count: number; until: number }>()
  const expired = (session: Session) =>
    now() - session.created >= (session.customerId ? absoluteMs : anonymousMs) ||
    now() - session.touched >= idleMs
  function remove(value: Session) {
    sessions.delete(value.token)
    if (value.backendTokens)
      void Promise.resolve(backend.revoke(value.backendTokens.refreshToken)).catch(() => {})
  }
  function active(value: Session) {
    if (value.closing) throw new AuthFailure(401, 'SESSION_REQUIRED', 'Please sign in again.')
    if (sessions.get(value.token) !== value || expired(value)) {
      remove(value)
      throw new AuthFailure(401, 'SESSION_REQUIRED', 'Please sign in again.')
    }
  }
  async function accessToken(value: Session) {
    active(value)
    if (!value.backendTokens)
      throw new AuthFailure(401, 'SESSION_REQUIRED', 'Please sign in again.')
    if (value.backendTokens.expiresAt <= now()) {
      value.refreshing ??= (async () => {
        const tokens = await backend.refresh(value.backendTokens!.refreshToken)
        try {
          active(value)
          if (tokens.customerId !== value.customerId)
            throw new AuthFailure(401, 'SESSION_REQUIRED', 'Please sign in again.')
          value.backendTokens = tokens
        } catch (error) {
          try {
            await backend.revoke(tokens.refreshToken)
          } catch (revokeError) {
            // Keep the rotated grant on a closing session so logout can retry it.
            value.backendTokens = tokens
            throw revokeError
          }
          throw error
        }
      })()
        .catch((error) => {
          if (!value.closing) remove(value)
          throw error
        })
        .finally(() => {
          value.refreshing = undefined
        })
      await value.refreshing
    }
    active(value)
    return value.backendTokens.accessToken
  }
  function session(event: H3Event, touch = false) {
    const token = getCookie(event, cookieName)
    const value = token ? sessions.get(token) : undefined
    if (!value) return undefined
    if (expired(value)) {
      remove(value)
      return undefined
    }
    if (touch) value.touched = now()
    return value
  }
  function issue(event: H3Event, customerId: string | null, customer?: Customer) {
    for (const value of sessions.values()) if (expired(value)) remove(value)
    if (customerId) {
      const authenticated = [...sessions.values()].filter((value) => value.customerId).length
      if (authenticated >= maxAuthenticatedSessions)
        throw new AuthFailure(503, 'AUTH_BUSY', 'Please try again shortly.')
    } else {
      const anonymous = [...sessions.values()]
        .filter((value) => !value.customerId)
        .sort((left, right) => left.created - right.created)
      while (anonymous.length >= maxAnonymousSessions) remove(anonymous.shift()!)
    }
    const value: Session = {
      token: randomBytes(32).toString('hex'),
      csrfToken: randomBytes(32).toString('hex'),
      customerId,
      customer,
      created: now(),
      touched: now(),
    }
    const secure = new URL(origin(event)).protocol === 'https:'
    sessions.set(value.token, value)
    setCookie(event, cookieName, value.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: (customerId ? absoluteMs : anonymousMs) / 1000,
    })
    return value
  }
  function csrf(event: H3Event, value: Session | undefined) {
    const expectedOrigin = origin(event)
    const token = getRequestHeader(event, 'x-csrf-token')
    if (
      !value ||
      getRequestHeader(event, 'origin') !== expectedOrigin ||
      !token ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(value.csrfToken))
    )
      throw new AuthFailure(403, 'CSRF_INVALID', 'Your session changed. Refresh and try again.')
  }
  function throttle(key: string, limit: number) {
    for (const [entry, value] of attempts) if (value.until <= now()) attempts.delete(entry)
    const value = attempts.get(key) ?? { count: 0, until: now() + 60_000 }
    if (value.count >= limit || (!attempts.has(key) && attempts.size >= 2_000))
      throw new AuthFailure(429, 'RATE_LIMITED', 'Too many login attempts. Try again in a minute.')
    value.count++
    attempts.set(key, value)
  }
  const response = (value: Session) => ({
    customer: value.customerId && !value.closing ? (value.customer ?? null) : null,
    csrfToken: value.csrfToken,
  })
  const auth = {
    async login(event: H3Event, email: string, password: string) {
      const current = session(event)
      csrf(event, current)
      throttle('global', 60)
      throttle(`email:${email}`, 8)
      // Socket peer only: untrusted forwarded IP headers cannot bypass limits.
      throttle(`ip:${event.node.req.socket?.remoteAddress ?? 'unknown'}`, 20)
      const tokens = await backend.login(email, password)
      try {
        const customer = await backend.identity(tokens.accessToken)
        if (customer.id !== tokens.customerId)
          throw new AuthFailure(
            502,
            'INVALID_RESPONSE',
            'The authenticated identity is inconsistent.',
          )
        if (!current) throw new AuthFailure(401, 'SESSION_REQUIRED', 'Please sign in again.')
        active(current)
        remove(current)
        const next = issue(event, tokens.customerId, customer)
        next.backendTokens = tokens
        return response(next)
      } catch (error) {
        try {
          await backend.revoke(tokens.refreshToken)
        } catch {
          /* Preserve the original session race error. The token expires server-side. */
        }
        throw error
      }
    },
    async logout(event: H3Event) {
      const current = session(event)
      csrf(event, current)
      // Block banking immediately, while retaining private credentials if upstream
      // revocation fails so this same cookie/CSRF pair can retry logout safely.
      current!.closing = true
      if (current!.refreshing) await current!.refreshing.catch(() => {})
      if (current!.backendTokens) await backend.revoke(current!.backendTokens.refreshToken)
      sessions.delete(current!.token)
      return response(issue(event, null))
    },
    banking(event: H3Event, mutation: boolean) {
      const current = session(event, true)
      if (!current?.customerId)
        throw new AuthFailure(401, 'SESSION_REQUIRED', 'Please sign in to continue.')
      if (mutation) csrf(event, current)
      const user = getRequestHeader(event, 'x-banking-user')
      if ((mutation || user !== undefined) && user !== current.customerId)
        throw new AuthFailure(
          409,
          'SESSION_CHANGED',
          'Your session changed. Refresh and try again.',
        )
      return current
    },
  }
  const loginSchema = z.strictObject({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(128),
  })
  return async (event: H3Event) => {
    setResponseHeader(event, 'cache-control', 'private, no-store')
    setResponseHeader(event, 'vary', 'Cookie')
    try {
      const path = getRequestURL(event).pathname
      if (path === '/api/auth/session' && event.method === 'GET') {
        const current = session(event)
        if (current) return response(current)
        const peer = event.node.req.socket?.remoteAddress
        if (peer) throttle(`anonymous:${peer}`, 120)
        return response(issue(event, null))
      }
      if (path === '/api/auth/login' && event.method === 'POST') {
        csrf(event, session(event))
        const parsed = loginSchema.safeParse(await readJsonBody(event))
        if (!parsed.success)
          throw new AuthFailure(400, 'INVALID_REQUEST', 'Enter a valid email and password.')
        return await auth.login(event, parsed.data.email, parsed.data.password)
      }
      if (path === '/api/auth/logout' && event.method === 'POST') return auth.logout(event)
      if (path.startsWith('/api/auth/'))
        throw new AuthFailure(404, 'NOT_FOUND', 'Endpoint not found.')
      const current = auth.banking(event, event.method !== 'GET')
      const token = await accessToken(current)
      // Trusted explicit authorization argument, never the browser's Authorization header.
      // Refresh happens before dispatch: mutations are sent exactly once and never replayed.
      return await backend.request(event, `Bearer ${token}`, () => active(current))
    } catch (error) {
      return httpErrorResponse(event, error)
    }
  }
}
