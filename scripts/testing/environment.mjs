import process from 'node:process'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

export async function createTestEnvironment() {
  const children = []
  async function start(extraEnv) {
    const listener = createServer()
    listener.listen(0, '127.0.0.1')
    await once(listener, 'listening')
    const port = listener.address().port
    await new Promise((resolve) => listener.close(resolve))
    const child = spawn(process.execPath, ['.output/server/index.mjs'], {
      env: {
        ...process.env,
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(port),
        NUXT_PUBLIC_ENABLE_BFF: 'false',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    let logs = ''
    child.stderr.on('data', (chunk) => {
      logs += chunk
    })
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server timeout: ${logs}`)), 20000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`Server exited ${code}: ${logs}`))
      })
      child.stdout.on('data', (chunk) => {
        logs += chunk
        const match = logs.match(/http:\/\/127\.0\.0\.1:\d+/)
        if (match) {
          clearTimeout(timer)
          resolve(match[0])
        }
      })
    })
    return { url, logs: () => logs }
  }
  return {
    start,
    close: async () => {
      await Promise.all(
        children.map(async (child) => {
          if (child.exitCode !== null || child.signalCode !== null) return
          const exited = once(child, 'exit')
          child.kill('SIGTERM')
          const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
          try {
            await exited
          } finally {
            clearTimeout(timer)
          }
        }),
      )
    },
  }
}
