import { defineEventHandler, setResponseHeader, setResponseStatus } from 'h3'
import { useRuntimeConfig } from '#imports'
import { createBffHandler } from '../utils/bffHandler'
import { createBffHttpBackend } from '../utils/bffHttpBackend'
import { readEnv } from '../../src/app/config/env'

let externalBff:
  { origin: string; apiBaseUrl: string; handler: ReturnType<typeof createBffHandler> } | undefined

/** Same-origin backend boundary; the upstream URL is private runtime configuration. */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  setResponseHeader(event, 'cache-control', 'private, no-store')
  if (readEnv(config.public).mocksEnabled) {
    setResponseStatus(event, 503)
    return {
      error: {
        code: 'DEMO_BROWSER_ONLY',
        message: 'Mock data needs browser storage. Reload the page and try again.',
      },
    }
  }
  if (String(config.public.enableBff) !== 'true') {
    setResponseStatus(event, 503)
    return {
      error: { code: 'BFF_NOT_CONFIGURED', message: 'The banking BFF is not enabled.' },
    }
  }
  try {
    const origin = config.authOrigin || ''
    const apiBaseUrl = config.bffApiBaseUrl || ''
    if (!apiBaseUrl) throw new Error('NUXT_BFF_API_BASE_URL is required.')
    if (!externalBff || externalBff.origin !== origin || externalBff.apiBaseUrl !== apiBaseUrl)
      externalBff = {
        origin,
        apiBaseUrl,
        handler: createBffHandler({
          trustedOrigin: origin,
          backend: createBffHttpBackend(apiBaseUrl),
        }),
      }
    return externalBff.handler(event)
  } catch {
    setResponseStatus(event, 503)
    return {
      error: {
        code: 'BFF_NOT_CONFIGURED',
        message: 'The banking BFF could not connect to its configured service.',
      },
    }
  }
})
