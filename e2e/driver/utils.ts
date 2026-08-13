import type { WaitOptions } from './types.js'

export async function waitFor(
  predicate: () => Promise<boolean>,
  opts?: WaitOptions,
): Promise<void> {
  const timeout = opts?.timeout ?? 10_000
  const interval = opts?.interval ?? 200
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    try {
      if (await predicate()) return
    } catch {
      // predicate threw — retry
    }
    await sleep(interval)
  }
  throw new Error(`waitFor timed out after ${timeout}ms`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function retry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; delay?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 3
  const delay = opts?.delay ?? 500
  let lastError: unknown
  return (async () => {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn()
      } catch (e) {
        lastError = e
        if (i < attempts - 1) await sleep(delay)
      }
    }
    throw lastError
  })()
}
