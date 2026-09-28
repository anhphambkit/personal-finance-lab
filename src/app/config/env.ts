import { z } from 'zod'

const envSchema = z.object({
  enableMocks: z.union([z.boolean(), z.enum(['true', 'false'])]).default('true'),
})

/** Accept Nuxt runtime overrides without treating the string "false" as truthy. */
export function readEnv(source: unknown) {
  const parsed = envSchema.parse(source)
  return { mocksEnabled: parsed.enableMocks === true || parsed.enableMocks === 'true' }
}
