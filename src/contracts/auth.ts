import type { Customer } from '@/domain/customers/customer'

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthSession {
  customer: Customer | null
  csrfToken: string
}
