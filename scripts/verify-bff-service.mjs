import process from 'node:process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const sampleRoot = process.cwd()
const serviceRoot = resolve(process.env.PERSONAL_FINANCE_API_DIR ?? '../personal-finance-api')
const serviceEntry = join(serviceRoot, 'src/start.js')
const nuxtEntry = join(sampleRoot, '.output/server/index.mjs')
await Promise.all([access(serviceEntry), access(nuxtEntry)])

async function availablePort() {
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port.')
  await new Promise((resolveClose) => listener.close(resolveClose))
  return address.port
}

async function start(command, args, options, readyPattern) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', (chunk) => {
    logs += chunk
  })
  child.stderr.on('data', (chunk) => {
    logs += chunk
  })
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`Process startup timed out:\n${logs}`)), 20_000)
    const inspect = () => {
      if (!readyPattern.test(logs)) return
      clearTimeout(timer)
      resolveReady()
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Process exited ${code}:\n${logs}`))
    })
  })
  return { child, logs: () => logs }
}

async function stop(running) {
  if (!running || running.child.exitCode !== null || running.child.signalCode !== null) return
  const exited = once(running.child, 'exit')
  running.child.kill('SIGTERM')
  const force = setTimeout(() => running.child.kill('SIGKILL'), 5_000)
  try {
    await exited
  } finally {
    clearTimeout(force)
  }
}

const working = await mkdtemp(join(tmpdir(), 'personal-finance-lab-bff-service-'))
const database = join(working, 'banking.sqlite')
const servicePort = await availablePort()
const nuxtPort = await availablePort()
const serviceUrl = `http://127.0.0.1:${servicePort}`
const nuxtUrl = `http://127.0.0.1:${nuxtPort}`
let service
let nuxt

function startService() {
  return start(
    process.execPath,
    [serviceEntry],
    {
      cwd: serviceRoot,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(servicePort),
        DATABASE_PATH: database,
        INITIAL_PASSWORD: 'DemoBank!2026',
      },
    },
    new RegExp(`Banking service listening on ${serviceUrl}`),
  )
}

let cookie = ''
function retainCookie(response) {
  const value = response.headers.getSetCookie()[0]
  if (value) cookie = value.split(';')[0] ?? cookie
}
async function request(path, init = {}) {
  const response = await fetch(`${nuxtUrl}${path}`, {
    ...init,
    headers: { ...(cookie ? { cookie } : {}), ...init.headers },
  })
  retainCookie(response)
  const data = response.status === 204 ? undefined : await response.json()
  return { response, data }
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  service = await startService()
  nuxt = await start(
    process.execPath,
    [nuxtEntry],
    {
      cwd: sampleRoot,
      env: {
        ...process.env,
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(nuxtPort),
        NUXT_PUBLIC_ENABLE_MOCKS: 'false',
        NUXT_PUBLIC_ENABLE_BFF: 'true',
        NUXT_BFF_API_BASE_URL: `${serviceUrl}/v1`,
        NUXT_AUTH_ORIGIN: nuxtUrl,
      },
    },
    new RegExp(`Listening on ${nuxtUrl}`),
  )

  const anonymous = await request('/api/auth/session')
  assert(anonymous.response.status === 200, 'Anonymous BFF session failed.')
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      origin: nuxtUrl,
      'content-type': 'application/json',
      'x-csrf-token': anonymous.data.csrfToken,
    },
    body: JSON.stringify({ email: 'taylor@example.com', password: 'DemoBank!2026' }),
  })
  assert(login.response.status === 200, `Login failed with ${login.response.status}.`)
  assert(!/accessToken|refreshToken|Bearer/.test(JSON.stringify(login.data)), 'BFF leaked a token.')
  const customerId = login.data.customer.id
  const csrfToken = login.data.csrfToken

  const accounts = await request('/api/accounts', {
    headers: { 'x-banking-user': customerId },
  })
  assert(accounts.response.status === 200 && accounts.data.length >= 2, 'Accounts request failed.')
  assert(accounts.response.headers.get('cache-control') === 'private, no-store', 'Cache is unsafe.')
  const [source, destination] = accounts.data.filter((account) => account.status === 'ACTIVE')
  assert(source && destination, 'The service needs two active accounts for the smoke transfer.')

  const page = await fetch(`${nuxtUrl}/accounts`, { headers: { cookie } })
  const html = await page.text()
  assert(
    page.status === 200 && html.includes(source.displayName),
    'Authenticated SSR did not render.',
  )

  const recoveryValue = JSON.stringify({
    version: 2,
    updatedAt: Date.now(),
    record: {
      stage: 'DETAILS',
      details: {
        sourceAccountId: source.id,
        recipientType: 'OWN_ACCOUNT',
        destinationId: destination.id,
        recipientNetwork: 'SAME_BANK',
        recipientAccountId: '',
        recipientName: '',
        bankName: '',
        amount: '1.00',
        reference: 'BFF smoke',
      },
    },
  })
  const mutationHeaders = {
    origin: nuxtUrl,
    'content-type': 'application/json',
    'x-banking-user': customerId,
    'x-csrf-token': csrfToken,
  }
  const saved = await request('/api/recovery', {
    method: 'POST',
    headers: mutationHeaders,
    body: JSON.stringify({ value: recoveryValue }),
  })
  assert(saved.response.ok, 'Recovery write failed.')

  const transferRequest = {
    idempotencyKey: `bff-smoke-${Date.now()}`,
    sourceAccountId: source.id,
    destination: { kind: 'OWN_ACCOUNT', accountId: destination.id },
    amountMinor: 100,
    currency: 'USD',
    reference: 'BFF smoke',
  }
  const transferred = await request('/api/transfers', {
    method: 'POST',
    headers: { ...mutationHeaders, 'idempotency-key': transferRequest.idempotencyKey },
    body: JSON.stringify(transferRequest),
  })
  assert(transferred.response.ok, 'Transfer failed.')
  const replayed = await request('/api/transfers', {
    method: 'POST',
    headers: { ...mutationHeaders, 'idempotency-key': transferRequest.idempotencyKey },
    body: JSON.stringify(transferRequest),
  })
  assert(replayed.response.ok && replayed.data.id === transferred.data.id, 'Replay was not stable.')

  await stop(service)
  service = await startService()
  const afterRestart = await request('/api/accounts', {
    headers: { 'x-banking-user': customerId },
  })
  const sourceAfter = afterRestart.data.find((account) => account.id === source.id)
  assert(
    sourceAfter.balanceMinor === source.balanceMinor - 100,
    'Transfer was applied incorrectly.',
  )
  const recovery = await request('/api/recovery', {
    headers: { 'x-banking-user': customerId },
  })
  assert(recovery.data.value === recoveryValue, 'Recovery did not survive service restart.')

  console.log(
    'BFF service smoke passed: auth, SSR, transfer replay, recovery and restart persistence.',
  )
} catch (error) {
  if (nuxt) process.stderr.write(nuxt.logs())
  if (service) process.stderr.write(service.logs())
  throw error
} finally {
  await stop(nuxt)
  await stop(service)
  await rm(working, { recursive: true, force: true })
}
