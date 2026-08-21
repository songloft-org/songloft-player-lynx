import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  appConfig,
  applyHostDeployMode,
  GLOBAL_PROP_DEPLOY_MODE,
} from '../app-config.js'
import { readLynxGlobal } from '../../../native/native-modules.js'

/**
 * `applyHostDeployMode` — the bootstrap-time second read of the host's
 * deploy-mode tag. On the web the tag lands in `lynx.__globalProps` when the
 * host page fires `lynxviewready`, which can be after this module evaluated;
 * without the late apply, a standalone static deploy probes as embedded (the
 * worker has `self.location` either way), hides the API-address field and
 * defaults the base URL to the static server's own origin — where no backend
 * lives. Fresh browsers could not log in at all.
 */

/** Install a fake host global with the given `__globalProps` payload. */
function hostGlobalProps(props: Record<string, unknown> | undefined) {
  const prev = (globalThis as Record<string, unknown>).lynx
  if (props === undefined) delete (globalThis as Record<string, unknown>).lynx
  else {
    ;(globalThis as Record<string, unknown>).lynx = { __globalProps: props }
  }
  return () => {
    if (prev === undefined) delete (globalThis as Record<string, unknown>).lynx
    else (globalThis as Record<string, unknown>).lynx = prev
  }
}

let restoreHost: () => void

beforeEach(() => {
  restoreHost = hostGlobalProps(undefined)
})

afterEach(() => {
  restoreHost()
  vi.unstubAllGlobals()
  appConfig.reset()
})

test('a standalone tag flips the mode and swaps an origin-derived base URL', () => {
  // Stage the untagged-static-deploy outcome: probed embedded, base URL = the
  // static server's origin (no backend behind it).
  vi.stubGlobal('self', { location: { origin: 'http://localhost:3000' } })
  appConfig.deployMode = 'embedded'
  appConfig.baseUrl = 'http://localhost:3000'
  restoreHost = hostGlobalProps({ [GLOBAL_PROP_DEPLOY_MODE]: 'standalone' })

  applyHostDeployMode()

  expect(appConfig.deployMode).toBe('standalone')
  expect(appConfig.baseUrl).toBe('http://localhost:58091')
})

test('a standalone tag leaves a user-configured base URL alone', () => {
  vi.stubGlobal('self', { location: { origin: 'http://localhost:3000' } })
  appConfig.deployMode = 'embedded'
  appConfig.baseUrl = 'http://192.168.1.100:58091'
  restoreHost = hostGlobalProps({ [GLOBAL_PROP_DEPLOY_MODE]: 'standalone' })

  applyHostDeployMode()

  expect(appConfig.deployMode).toBe('standalone')
  expect(appConfig.baseUrl).toBe('http://192.168.1.100:58091')
})

test('an embedded tag only flips the mode', () => {
  appConfig.deployMode = 'standalone'
  appConfig.baseUrl = 'http://kept:1234'
  restoreHost = hostGlobalProps({ [GLOBAL_PROP_DEPLOY_MODE]: 'embedded' })

  applyHostDeployMode()

  expect(appConfig.deployMode).toBe('embedded')
  expect(appConfig.baseUrl).toBe('http://kept:1234')
})

test('no tag (native hosts) is a no-op', () => {
  appConfig.deployMode = 'standalone'
  appConfig.baseUrl = 'http://kept:1234'

  applyHostDeployMode()

  expect(appConfig.deployMode).toBe('standalone')
  expect(appConfig.baseUrl).toBe('http://kept:1234')
})

test('a tag matching the current mode is a no-op (idempotent)', () => {
  appConfig.deployMode = 'standalone'
  restoreHost = hostGlobalProps({ [GLOBAL_PROP_DEPLOY_MODE]: 'standalone' })

  applyHostDeployMode()
  applyHostDeployMode()

  expect(appConfig.deployMode).toBe('standalone')
})

test('unrecognized tag values are ignored', () => {
  appConfig.deployMode = 'standalone'
  restoreHost = hostGlobalProps({ [GLOBAL_PROP_DEPLOY_MODE]: 'something-else' })

  applyHostDeployMode()

  expect(appConfig.deployMode).toBe('standalone')
})

test('the global-prop key matches what the web host page writes', () => {
  // readLynxGlobal is the same accessor system-appearance uses; guard its
  // presence so a refactor of native-modules cannot silently break the read.
  expect(typeof readLynxGlobal).toBe('function')
  expect(GLOBAL_PROP_DEPLOY_MODE).toBe('deployMode')
})
