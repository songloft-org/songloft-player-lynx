import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

function lifecycle() {
  const source = readFileSync(new URL('../../harmony/entry/src/main/ets/modules/system/AppLifecycle.ets', import.meta.url), 'utf8').replace(/^import .*$/gm, '')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  runInNewContext(code, { exports, LynxViewClient: class {} })
  const events = [], context = { sendGlobalEvent: (name, params) => events.push([name, structuredClone(params)]) }
  return { ...exports, events, context }
}

test('foreground before first screen is delivered once after readiness, with an array payload', () => {
  const h = lifecycle(), client = new h.AppLifecycleClient()
  h.AppLifecycle.enterForeground(); client.attach(h.context)
  assert.equal(h.events.length, 0)
  client.onFirstScreen(); client.onFirstScreen(); h.AppLifecycle.enterForeground()
  assert.deepEqual(h.events, [['SongloftLifecycle.resumed', [{ state: 'resumed' }]]])
  h.AppLifecycle.enterBackground(); h.AppLifecycle.enterForeground(); assert.equal(h.events.length, 2)
})

test('a background transition before readiness cancels the pending resume', () => {
  const h = lifecycle(), client = new h.AppLifecycleClient()
  client.attach(h.context); h.AppLifecycle.enterForeground(); h.AppLifecycle.enterBackground(); client.onFirstScreen()
  assert.equal(h.events.length, 0)
  h.AppLifecycle.enterForeground(); assert.equal(h.events.length, 1)
})

test('old view readiness/disposal cannot affect the replacement root view', () => {
  const h = lifecycle(), old = new h.AppLifecycleClient(), current = new h.AppLifecycleClient()
  const other = { sendGlobalEvent: () => { throw new Error('stale context') } }
  old.attach(other); current.attach(h.context); h.AppLifecycle.enterForeground()
  old.onFirstScreen(); old.onDestroy(); assert.equal(h.events.length, 0)
  current.onFirstScreen(); assert.equal(h.events.length, 1)
  current.onDestroy(); h.AppLifecycle.enterBackground(); h.AppLifecycle.enterForeground()
  assert.equal(h.events.length, 1)
})

test('destroy/reset releases context and reinitializes the next ability lifecycle', () => {
  const h = lifecycle(), client = new h.AppLifecycleClient()
  client.attach(h.context); client.onFirstScreen(); h.AppLifecycle.enterForeground(); h.AppLifecycle.reset()
  h.AppLifecycle.markReady(h.context); h.AppLifecycle.enterForeground(); assert.equal(h.events.length, 1)
  const replacement = new h.AppLifecycleClient(); replacement.attach(h.context); replacement.onFirstScreen()
  assert.equal(h.events.length, 2)
})
