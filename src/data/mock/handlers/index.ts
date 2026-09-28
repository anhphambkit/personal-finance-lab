import { createIndexedDbBankingRepository } from '../../repositories/indexedDbBankingRepository'
import { createBankingHandlers } from './banking'

export const handlers = createBankingHandlers(createIndexedDbBankingRepository())
