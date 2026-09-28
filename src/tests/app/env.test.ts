import { describe, expect, it } from 'vitest'
import { readEnv } from '../../app/config/env'

describe('Nuxt runtime configuration', () => {
  it.each([
    [{}, true],
    [{ enableMocks: 'true' }, true],
    [{ enableMocks: 'false' }, false],
    [{ enableMocks: true }, true],
    [{ enableMocks: false }, false],
  ])('reads explicit/default config %j', (source, mocksEnabled) => {
    expect(readEnv(source)).toEqual({ mocksEnabled })
  })
  it('rejects malformed settings instead of accidentally enabling mocks', () => {
    expect(() => readEnv({ enableMocks: 'invalid' })).toThrow()
  })
})
