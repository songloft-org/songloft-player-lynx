import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

// Execute actual source with SDK adapters. This does not compile ArkTS or prove device clipboard behavior.
function host(pasteboard) {
  const path = new URL('../../harmony/entry/src/main/ets/modules/platform/SongloftPlatformModule.ets', import.meta.url)
  const source = readFileSync(path, 'utf8').replace(/^import .*\n/gm, '')
  const result = ts.transpileModule(source, { fileName: fileURLToPath(path), compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  }, reportDiagnostics: true })
  assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
  const exports = {}
  runInNewContext(result.outputText, { exports, pasteboard, LynxModule: class {}, ClientFileLog: { init() {} } })
  return new exports.SongloftPlatformModule({}, {})
}

test('HarmonyOS callback waits for Pasteboard acceptance and preserves Unicode; legacy delegates', async () => {
  const writes = []
  let finish
  const module = host({ MIMETYPE_TEXT_PLAIN: 'text/plain', createData: (mime, text) => ({ mime, text }),
    getSystemPasteboard: () => ({ setData: data => { writes.push(data); return new Promise(resolve => { finish = resolve }) } }) })
  const replies = []
  module.setClipboardWithResult('中文🎵\n路径', error => replies.push(error))
  assert.deepEqual(replies, [])
  assert.deepEqual(writes, [{ mime: 'text/plain', text: '中文🎵\n路径' }])
  finish(); await Promise.resolve()
  assert.deepEqual(replies, [null])
  module.setClipboard('legacy'); finish(); await Promise.resolve()
  assert.equal(writes.at(-1).text, 'legacy')
})

test('HarmonyOS SDK rejection and synchronous failure confirm failure exactly once', async () => {
  for (const failure of ['create', 'get', 'write', 'reject']) {
    const module = host({ MIMETYPE_TEXT_PLAIN: 'text/plain', createData: () => {
      if (failure === 'create') throw new Error('invalid'); return {}
    }, getSystemPasteboard: () => {
      if (failure === 'get') throw new Error('missing')
      return { setData: () => { if (failure === 'write') throw new Error('busy'); return Promise.reject(new Error('denied')) } }
    } })
    const replies = []
    module.setClipboardWithResult('text', error => replies.push(error))
    await Promise.resolve()
    assert.deepEqual(replies, ['clipboard_failed'])
    module.setClipboard('legacy'); await Promise.resolve()
  }
})
