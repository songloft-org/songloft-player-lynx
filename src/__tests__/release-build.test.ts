import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'

const root = path.resolve(__dirname, '../..')
const read = (name: string) => readFileSync(path.join(root, name), 'utf8')

function blockAfter(source: string, marker: string): string {
  const at = source.indexOf(marker)
  expect(at, `Missing guard ${marker}`).toBeGreaterThanOrEqual(0)
  const start = source.indexOf('{', at)
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}' && --depth === 0) return source.slice(start + 1, i)
  }
  throw new Error(`Unclosed block ${marker}`)
}

test('published Lynx and Web bundles contain no TCP evaluator or E2E store handles', () => {
  for (const file of ['dist/main.lynx.bundle', 'dist/web/main.web.bundle']) {
    const data = readFileSync(path.join(root, file)).toString('latin1')
    for (const marker of [
      'TestBridge.eval',
      '__E2E_PLAYER_STORE__',
      '__E2E_AUTH_STORE__',
    ]) {
      expect(data.includes(marker), `${file} includes ${marker}`).toBe(false)
    }
  }
})

test('Android registration, startup and server entry are debug-only and loopback-bound', () => {
  const application = read(
    'android/app/src/main/java/org/songloft/lynx/SongloftApplication.kt',
  )
  const env = blockAfter(application, 'private fun initLynxEnv()')
  const guarded = blockAfter(env, 'if (BuildConfig.DEBUG)')
  expect(guarded).toContain('registerModule("SongloftTestBridge"')
  expect(guarded).toContain('TestBridgeServer().start()')
  expect(env.replace(guarded, '')).not.toContain('TestBridgeServer().start()')
  const server = read(
    'android/app/src/main/java/org/songloft/lynx/test/TestBridgeServer.kt',
  )
  expect(blockAfter(server, 'fun start()').trim()).toMatch(
    /^if \(!org\.songloft\.lynx\.BuildConfig\.DEBUG\) return/,
  )
  expect(server).toMatch(
    /ServerSocket\(\s*port,\s*5,\s*(?:java\.net\.)?InetAddress\.getLoopbackAddress\(\)\s*,?\s*\)/,
  )
})

test('iOS server and module setup disappear when DEBUG is not defined', () => {
  const app = read('ios/SongloftLynx/AppDelegate.swift')
  const view = read('ios/SongloftLynx/ViewController.swift')
  const stripDebug = (source: string) =>
    source.replace(/#if DEBUG[\s\S]*?#endif/g, '')
  expect(app).toContain('testBridgeServer.start()')
  expect(stripDebug(app)).not.toContain('testBridgeServer')
  expect(view).toContain('config.register(SongloftTestBridgeModule.self)')
  expect(stripDebug(view)).not.toContain(
    'config.register(SongloftTestBridgeModule.self)',
  )
  const server = read('ios/SongloftLynx/TestBridgeServer.swift')
  expect(blockAfter(stripDebug(server), 'func start()').trim()).toBe('')
  expect(server).toContain('inet_addr("127.0.0.1")')
})
