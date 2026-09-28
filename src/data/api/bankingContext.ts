import { inject, type InjectionKey, type Ref } from 'vue'
import type { BankingSession } from './bankingSession'
import type { BankingApi } from '../../contracts/banking'

export interface BankingContext {
  session: BankingSession
  api: BankingApi
  ready: Ref<boolean>
  mocksEnabled: boolean
}

export const bankingContextKey: InjectionKey<BankingContext> = Symbol('banking')

export function useBankingContext() {
  const context = inject(bankingContextKey)
  if (!context) throw new Error('Banking plugin is required.')
  return context
}
