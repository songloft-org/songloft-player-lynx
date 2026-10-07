import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { setTimeout } from 'node:timers/promises'

async function main() {
  const [portFile, rawPid, rawTimeout = '30000', ...extra] = process.argv.slice(2)
  const pid = Number(rawPid)
  const timeoutMs = Number(rawTimeout)
  if (
    !portFile || !Number.isSafeInteger(pid) || pid <= 0 ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || extra.length
  ) {
    throw new Error('Usage: node scripts/wait-for-fixture.mjs <port-file> <pid> [timeout-ms]')
  }

  const started = performance.now()
  console.log(`[fixture] Waiting up to ${timeoutMs}ms for ${portFile} (PID ${pid})`)
  while (true) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      throw new Error(`Fixture process ${pid} is unavailable before readiness (${error.code}); port file: ${portFile}`)
    }
    try {
      if ((await readFile(portFile, 'utf8')).trim()) {
        console.log(`[fixture] Ready after ${Math.round(performance.now() - started)}ms: ${portFile}`)
        return
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Cannot read fixture port file ${portFile}: ${error.message}`)
      }
    }
    const remaining = timeoutMs - (performance.now() - started)
    if (remaining <= 0) {
      throw new Error(`Fixture readiness timed out after ${timeoutMs}ms; PID ${pid} is still running; port file missing or empty: ${portFile}`)
    }
    await setTimeout(Math.min(100, remaining))
  }
}

main().catch(error => {
  console.error(`[fixture] ${error.message}`)
  process.exitCode = 1
})
