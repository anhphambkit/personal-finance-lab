import { inject, type InjectionKey, type Ref } from 'vue'
import type { BankingApi } from '../../contracts/banking'

export interface BankingContext {
  api: BankingApi
  ready: Ref<boolean>
}

export const bankingContextKey: InjectionKey<BankingContext> = Symbol('banking')

export function useBankingContext() {
  const context = inject(bankingContextKey)
  if (!context) throw new Error('Banking plugin is required.')
  return context
}
