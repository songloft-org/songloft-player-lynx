import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const waiter = join(repo, 'scripts/wait-for-fixture.mjs')

function directory(t) {
  const root = mkdtempSync(join(tmpdir(), 'lynx-fixture-wait-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

async function fixture(t, portFile, delay, content = '12345') {
  const code = `
    const { writeFileSync } = require('node:fs')
    const [file, delay, content] = process.argv.slice(1)
    const publish = () => writeFileSync(file, content)
    if (Number(delay) === 0) publish(); else setTimeout(publish, Number(delay))
    setInterval(() => {}, 1000)
    process.send('started')
  `
  const child = spawn(process.execPath, ['-e', code, portFile, String(delay), content], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const ended = once(child, 'exit')
      child.kill()
      await ended
    }
  })
  await once(child, 'message')
  return child
}

test('an already published port file is ready while its fixture is alive', async t => {
  const root = directory(t), portFile = join(root, 'port')
  const child = await fixture(t, portFile, 0)
  const result = await run(process.execPath, [waiter, portFile, String(child.pid)])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /Ready after/)
})

test('the default wait accepts a fixture starting beyond the old five-second window', { timeout: 15000 }, async t => {
  const root = directory(t), portFile = join(root, 'ports.json')
  const child = await fixture(t, portFile, 6000, JSON.stringify({ http: 12345, https: 23456 }))
  const started = performance.now()
  const result = await run(process.execPath, [waiter, portFile, String(child.pid)])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /Waiting up to 30000ms/)
  assert.ok(performance.now() - started >= 5000)
  assert.deepEqual(JSON.parse(readFileSync(portFile)), { http: 12345, https: 23456 })
})

test('a dead fixture fails immediately even when a stale port file exists', async t => {
  const root = directory(t), portFile = join(root, 'port')
  const child = await fixture(t, portFile, 0)
  const ended = once(child, 'exit')
  child.kill()
  await ended
  const result = await run(process.execPath, [waiter, portFile, String(child.pid), '10000'])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /unavailable before readiness/)
  assert.ok(result.stderr.includes(portFile))
  assert.doesNotMatch(result.stdout, /Ready after/)
})

test('a live fixture that never publishes a nonempty port file reports a bounded timeout', async t => {
  const root = directory(t), portFile = join(root, 'port')
  writeFileSync(portFile, '')
  const child = await fixture(t, portFile, 10000)
  const started = performance.now()
  const result = await run(process.execPath, [waiter, portFile, String(child.pid), '250'])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /timed out after 250ms/)
  assert.match(result.stderr, /still running/)
  assert.ok(result.stderr.includes(portFile))
  assert.ok(performance.now() - started < 3000)
})

test('invalid CLI arguments fail with usage rather than probing an unrelated process', async () => {
  for (const args of [[], ['/tmp/unused', '0'], ['/tmp/unused', '-1'], ['/tmp/unused', '1', 'NaN']]) {
    const result = await run(process.execPath, [waiter, ...args])
    assert.equal(result.code, 1)
    assert.match(result.stderr, /Usage:/)
  }
})

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function workflowBlock(name) {
  const workflow = readFileSync(join(repo, '.github/workflows/build-and-release.yml'), 'utf8')
  const marker = `      - name: ${name}\n        run: |\n`
  const section = workflow.split(marker)[1]
  assert.ok(section, `Missing workflow step: ${name}`)
  return section.split('\n      - ')[0].split('\n').map(line => line.slice(10)).join('\n')
}

for (const [kind, name] of [
  ['cache', 'Verify device cache with Apple Foundation and real HTTP/files'],
  ['templates', 'Verify plugin templates with Apple Foundation and real HTTP/TLS'],
]) {
  for (const failure of [false, true]) {
    test(`${kind} workflow ${failure ? 'stops before compilation on fixture failure' : 'runs compilation and verification'} and reaps its fixture`, { timeout: 15000 }, async t => {
      const root = mkdtempSync(join(tmpdir(), 'lynx-fixture-workflow-'))
      const bin = join(root, 'bin'), runnerTemp = join(root, 'runner-temp')
      mkdirSync(bin); mkdirSync(runnerTemp)
      const pidFile = join(root, 'fixture-pid'), compiled = join(root, 'compiled'), verified = join(root, 'verified')
      t.after(() => {
        try {
          if (existsSync(pidFile)) {
            try { process.kill(Number(readFileSync(pidFile, 'utf8'))) } catch (error) {
              if (error.code !== 'ESRCH') throw error
            }
          }
        } finally {
          rmSync(root, { recursive: true, force: true })
        }
      })
      const fixtureScript = join(root, 'fixture.cjs')
      writeFileSync(fixtureScript, `
        const { writeFileSync } = require('node:fs')
        writeFileSync(process.env.FIXTURE_PID_FILE, String(process.pid))
        if (process.env.FIXTURE_FAILURE === 'true') {
          console.error('intentional fixture failure'); process.exit(7)
        }
        const args = process.argv.slice(2)
        const portFile = args[args.indexOf('--port-file') + 1]
        writeFileSync(portFile, args[0].includes('template') ? '{"http":12345,"https":23456}' : '12345')
        setInterval(() => {}, 1000)
      `)
      const compilerScript = join(root, 'compiler.cjs')
      writeFileSync(compilerScript, `
        const { chmodSync, writeFileSync } = require('node:fs')
        const args = process.argv.slice(2), output = args[args.indexOf('-o') + 1]
        writeFileSync(process.env.COMPILED_MARKER, 'compiled')
        writeFileSync(output, '#!/bin/sh\\nprintf verified > "$VERIFIED_MARKER"\\n')
        chmodSync(output, 0o755)
      `)
      for (const [command, script] of [['python3', fixtureScript], ['swiftc', compilerScript]]) {
        const path = join(bin, command)
        writeFileSync(path, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(script)} "$@"\n`)
        chmodSync(path, 0o755)
      }
      // TLS certificate generation is outside this shell lifecycle test.
      writeFileSync(join(bin, 'openssl'), '#!/bin/sh\nexit 0\n')
      chmodSync(join(bin, 'openssl'), 0o755)
      const result = await run('bash', ['-c', workflowBlock(name)], {
        cwd: repo,
        env: {
          ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: runnerTemp,
          FIXTURE_PID_FILE: pidFile, FIXTURE_FAILURE: String(failure),
          COMPILED_MARKER: compiled, VERIFIED_MARKER: verified,
        },
      })
      assert.equal(result.code, failure ? 1 : 0, result.stderr)
      assert.equal(existsSync(compiled), !failure)
      assert.equal(existsSync(verified), !failure)
      if (failure) {
        assert.match(result.stderr, /intentional fixture failure/)
        assert.match(result.stderr, /unavailable before readiness/)
      } else {
        assert.match(result.stdout, /Compiling Apple/)
        assert.match(result.stdout, /Running Apple/)
      }
      const pid = Number(readFileSync(pidFile, 'utf8'))
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
      assert.equal(existsSync(join(runnerTemp, 'cache-port')), kind === 'cache' && !failure)
      if (kind === 'templates') assert.deepEqual(readdirSync(runnerTemp), [])
    })
  }
}
