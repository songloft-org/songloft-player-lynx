import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { TestBridgeClient } from './test-bridge-client.js'
import type { E2EDriver, E2EElement, PlayerAction, PlayerStateSnapshot, WaitOptions } from './types.js'
import { sleep, waitFor, retry } from './utils.js'

const PACKAGE = 'org.songloft.lynx'
const ACTIVITY = `${PACKAGE}/.MainActivity`
const BRIDGE_PORT = 9230
const SCREENSHOT_DIR = path.resolve('e2e/screenshots')

function adb(cmd: string): string {
  return execSync(`adb ${cmd}`, { encoding: 'utf8', timeout: 15_000 }).trim()
}

class AndroidElement implements E2EElement {
  constructor(
    private bridge: TestBridgeClient,
    private testId: string,
  ) {}

  async tap(): Promise<void> {
    await this.bridge.evaluate(`
      (() => {
        // Dispatch a tap event on the element with this testId
        // In Lynx, we trigger the element's bindtap handler
        const el = document.querySelector('[data-testid="${this.testId}"]');
        if (el) el.dispatchEvent(new Event('tap'));
      })()
    `)
  }

  async longPress(): Promise<void> {
    await this.bridge.evaluate(`
      (() => {
        const el = document.querySelector('[data-testid="${this.testId}"]');
        if (el) el.dispatchEvent(new Event('longpress'));
      })()
    `)
  }

  async swipe(direction: 'left' | 'right' | 'up' | 'down'): Promise<void> {
    await this.bridge.evaluate(`
      (() => {
        const el = document.querySelector('[data-testid="${this.testId}"]');
        if (el) el.dispatchEvent(new Event('swipe', { detail: { direction: '${direction}' } }));
      })()
    `)
  }

  async getText(): Promise<string> {
    return this.bridge.evaluate<string>(`
      (() => {
        const el = document.querySelector('[data-testid="${this.testId}"]');
        return el?.textContent ?? '';
      })()
    `)
  }

  async isVisible(): Promise<boolean> {
    return this.bridge.evaluate<boolean>(`
      (() => {
        const el = document.querySelector('[data-testid="${this.testId}"]');
        return el != null;
      })()
    `)
  }

  async getAttribute(name: string): Promise<string | null> {
    return this.bridge.evaluate<string | null>(`
      (() => {
        const el = document.querySelector('[data-testid="${this.testId}"]');
        return el?.getAttribute('${name}') ?? null;
      })()
    `)
  }
}

export class AndroidDriver implements E2EDriver {
  private bridge = new TestBridgeClient()

  async launch(): Promise<void> {
    adb(`forward tcp:${BRIDGE_PORT} tcp:${BRIDGE_PORT}`)

    // Try to connect to an already-running app first
    try {
      await this.bridge.connect('127.0.0.1', BRIDGE_PORT, 2000)
      if (await this.bridge.ping()) {
        await this.waitForJSBridge()
        return
      }
    } catch {
      // Not running — start fresh
    }
    await this.bridge.close()

    try { adb(`shell am force-stop ${PACKAGE}`) } catch { /* noop */ }
    await sleep(500)

    adb(`shell am start -n ${ACTIVITY}`)
    await sleep(3000)

    await retry(
      () => this.bridge.connect('127.0.0.1', BRIDGE_PORT, 5000),
      { attempts: 5, delay: 1000 },
    )

    const pong = await this.bridge.ping()
    if (!pong) throw new Error('TestBridge ping failed')

    await this.waitForJSBridge()
  }

  private async waitForJSBridge(): Promise<void> {
    await retry(
      async () => {
        const ready = await this.bridge.evaluate<boolean>(
          `typeof globalThis.__E2E_PLAYER_STORE__ !== 'undefined'`,
        )
        if (!ready) throw new Error('e2e-bridge not ready')
        return ready
      },
      { attempts: 15, delay: 500 },
    )
    await this.bridge.evaluate(`
      globalThis.__E2E_APP_CONFIG__.resolvedBaseUrl = '${process.env.E2E_API_BASE ?? 'http://localhost:58091'}'
    `)
  }

  async teardown(): Promise<void> {
    await this.bridge.close()
    // Don't force-stop — other suites may share the same app instance
  }

  async login(user: string, pass: string): Promise<void> {
    await this.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_AUTH_STORE__;
        await store.getState().login({ username: '${user}', password: '${pass}' });
      })()
    `)
    await sleep(1000)
  }

  async navigate(routePath: string): Promise<void> {
    await this.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '${routePath}' })
    `)
    await sleep(500)
  }

  async query(testId: string): Promise<E2EElement> {
    const exists = await this.evaluateJS<boolean>(`
      document.querySelector('[data-testid="${testId}"]') != null
    `)
    if (!exists) {
      throw new Error(`Element not found: [data-testid="${testId}"]`)
    }
    return new AndroidElement(this.bridge, testId)
  }

  async queryAll(testId: string): Promise<E2EElement[]> {
    const count = await this.evaluateJS<number>(`
      document.querySelectorAll('[data-testid="${testId}"]').length
    `)
    return Array.from({ length: count }, (_, i) => new AndroidElement(this.bridge, testId))
  }

  async tapPlayer(action: PlayerAction): Promise<void> {
    const actionMap: Record<PlayerAction, string> = {
      play: `globalThis.__E2E_PLAYER_STORE__.getState().togglePlay()`,
      pause: `globalThis.__E2E_PLAYER_STORE__.getState().togglePlay()`,
      next: `globalThis.__E2E_PLAYER_STORE__.getState().playNext()`,
      prev: `globalThis.__E2E_PLAYER_STORE__.getState().playPrev()`,
      stop: `globalThis.__E2E_PLAYER_STORE__.getState().clearPlaylist()`,
    }
    await this.evaluateJS(actionMap[action])
    await sleep(300)
  }

  async getPlayerState(): Promise<PlayerStateSnapshot> {
    return this.evaluateJS<PlayerStateSnapshot>(`
      (() => {
        const state = globalThis.__E2E_PLAYER_STORE__.getState();
        return {
          state: state.isBuffering ? 'loading' :
                 state.isPlaying ? 'playing' :
                 state.errorMessage ? 'error' :
                 state.currentSong ? 'paused' : 'idle',
          positionMs: state.currentTime,
          durationMs: state.duration,
          index: state.currentIndex,
          songTitle: state.currentSong?.title ?? '',
          speed: state.speed,
          playMode: state.playMode,
          errorMessage: state.errorMessage,
        };
      })()
    `)
  }

  async getStorageItem(area: 'prefs' | 'secure', key: string): Promise<string | null> {
    return this.evaluateJS<string | null>(`
      (() => {
        const nm = globalThis.NativeModules?.SongloftStorage;
        if (!nm) return null;
        return nm.getItem('${area}', '${key}');
      })()
    `)
  }

  async evaluateJS<T = unknown>(expression: string): Promise<T> {
    return this.bridge.evaluate<T>(expression)
  }

  async waitFor(predicate: () => Promise<boolean>, opts?: WaitOptions): Promise<void> {
    return waitFor(predicate, opts)
  }

  async sleep(ms: number): Promise<void> {
    return sleep(ms)
  }

  async screenshot(name: string): Promise<string> {
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    const filePath = path.join(SCREENSHOT_DIR, `android-${name}.png`)
    execSync(`adb exec-out screencap -p > "${filePath}"`, { timeout: 10_000 })
    return filePath
  }
}
