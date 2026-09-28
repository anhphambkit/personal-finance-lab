import type { H3Event } from 'h3'
import type { Customer } from '../../src/domain/customers/customer'

export interface BffTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  customerId: string
}

export interface BffBackend {
  login(email: string, password: string): Promise<BffTokens>
  refresh(refreshToken: string): Promise<BffTokens>
  revoke(refreshToken: string): void | Promise<void>
  identity(accessToken: string): Promise<Customer>
  request(event: H3Event, authorization: string, assertSessionActive: () => void): Promise<unknown>
}
