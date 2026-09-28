import { getRequestWebStream, setResponseStatus, type H3Event } from 'h3'
import { AuthFailure } from '../lib/authFailure'

export async function readJsonBody(event: H3Event) {
  if (!event.headers.get('content-type')?.startsWith('application/json'))
    throw new AuthFailure(415, 'INVALID_REQUEST', 'Send a JSON request.')
  const limit = 70_000
  if (Number(event.headers.get('content-length')) > limit)
    throw new AuthFailure(413, 'INVALID_REQUEST', 'Request is too large.')
  const reader = getRequestWebStream(event)?.getReader()
  if (!reader) throw new AuthFailure(400, 'INVALID_REQUEST', 'Invalid request body.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new AuthFailure(413, 'INVALID_REQUEST', 'Request is too large.')
    }
    chunks.push(chunk.value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new AuthFailure(400, 'INVALID_REQUEST', 'Invalid request body.')
  }
}

export function httpErrorResponse(event: H3Event, error: unknown) {
  const failure =
    error instanceof AuthFailure
      ? error
      : new AuthFailure(500, 'INTERNAL_ERROR', 'The request could not be completed.')
  setResponseStatus(event, failure.status)
  return { error: { code: failure.code, message: failure.message } }
}
