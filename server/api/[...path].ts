import { defineEventHandler, setResponseHeader, setResponseStatus } from 'h3'

/** Banking endpoints exist only in the browser demo and are intercepted by MSW. */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'private, no-store')
  setResponseStatus(event, 503)
  return {
    error: {
      code: 'DEMO_BROWSER_ONLY',
      message: 'Demo data needs browser storage. Reload the page and try again.',
    },
  }
})
