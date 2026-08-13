import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { TestBridgeClient } from './test-bridge-client.js'
import {
  bootSimulator,
  findSimulator,
  getBootedSimulator,
  installApp,
  isAppInstalled,
  launchApp,
  overrideStatusBar,
  setAppearance,
  takeScreenshot,
  terminateApp,
  uninstallApp,
  waitForBoot,
  openURL as simOpenURL,
  clearStatusBarOverride,
  type SimulatorDevice,
} from './ios-simulator.js'
import type {
  E2EDriver,
  E2EElement,
  PlayerAction,
  PlayerStateSnapshot,
  WaitOptions,
} from './types.js'
import { sleep, waitFor, retry } from './utils.js'

const BUNDLE_ID = 'org.songloft.lynx'
const APP_PATH = path.resolve('ios/build/Debug-iphonesimulator/SongloftLynx.app')
const BRIDGE_PORT = 9230
const SCREENSHOT_DIR = path.resolve('e2e/screenshots')

export class IOSDriver implements E2EDriver {
  private bridge = new TestBridgeClient()
  private simulatorUdid: string | null = null

  async launch(): Promise<void> {
    let device: SimulatorDevice | null = getBootedSimulator()
    if (!device) {
      device = findSimulator()
      if (!device) {
        throw new Error(
          'No iOS simulator available. Install one via Xcode → Settings → Platforms.',
        )
      }
      console.log(`[e2e:ios] Booting simulator: ${device.name}`)
      bootSimulator(device.udid)
      await waitForBoot(device.udid)
    }
    this.simulatorUdid = device.udid
    console.log(`[e2e:ios] Using simulator: ${device.name} (${device.udid})`)

    if (!isAppInstalled(device.udid, BUNDLE_ID)) {
      console.log(`[e2e:ios] Installing app from ${APP_PATH}`)
      installApp(device.udid, APP_PATH)
    }

    // Try to connect to an already-running app
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

    terminateApp(device.udid, BUNDLE_ID)
    await sleep(500)
    overrideStatusBar(device.udid)
    launchApp(device.udid, BUNDLE_ID)
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
      globalThis.__E2E_APP_CONFIG__.resolvedBaseUrl = 'http://localhost:58091'
    `)
  }

  async teardown(): Promise<void> {
    await this.bridge.close()
    if (this.simulatorUdid) {
      clearStatusBarOverride(this.simulatorUdid)
    }
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

  async query(_testId: string): Promise<E2EElement> {
    throw new Error('query() not supported on iOS TestBridge driver — use evaluateJS')
  }

  async queryAll(_testId: string): Promise<E2EElement[]> {
    throw new Error('queryAll() not supported on iOS TestBridge driver — use evaluateJS')
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

  async setSystemTheme(theme: 'light' | 'dark'): Promise<void> {
    if (!this.simulatorUdid) throw new Error('No simulator booted')
    setAppearance(this.simulatorUdid, theme)
    await sleep(1000)
  }

  async setSystemLocale(locale: string): Promise<void> {
    await this.evaluateJS(`
      (() => {
        const lynxObj = (typeof lynx !== 'undefined') ? lynx : globalThis.lynx;
        if (lynxObj && lynxObj.__globalProps) {
          lynxObj.__globalProps.locale = '${locale}';
        }
        const listener = globalThis.__SYSTEM_APPEARANCE_LISTENER__;
        if (listener) listener({ theme: lynxObj?.__globalProps?.theme ?? 'light', locale: '${locale}' });
      })()
    `)
    await sleep(500)
  }

  async simulateNetworkCondition(condition: 'offline' | 'slow' | 'normal'): Promise<void> {
    if (!this.simulatorUdid) throw new Error('No simulator booted')
    const bars: Record<string, string> = {
      offline: '--wifiBars 0 --cellularBars 0',
      slow: '--wifiBars 1 --cellularBars 1',
      normal: '--wifiBars 3 --cellularBars 4',
    }
    execSync(`xcrun simctl status_bar ${this.simulatorUdid} override ${bars[condition]}`)
    await sleep(300)
  }

  async openURL(url: string): Promise<void> {
    if (!this.simulatorUdid) throw new Error('No simulator booted')
    simOpenURL(this.simulatorUdid, url)
    await sleep(1000)
  }

  async clearAppData(): Promise<void> {
    if (!this.simulatorUdid) throw new Error('No simulator booted')
    terminateApp(this.simulatorUdid, BUNDLE_ID)
    await sleep(300)
    uninstallApp(this.simulatorUdid, BUNDLE_ID)
    await sleep(500)
    installApp(this.simulatorUdid, APP_PATH)
    await sleep(500)
  }

  async waitFor(predicate: () => Promise<boolean>, opts?: WaitOptions): Promise<void> {
    return waitFor(predicate, opts)
  }

  async sleep(ms: number): Promise<void> {
    return sleep(ms)
  }

  async screenshot(name: string): Promise<string> {
    if (!this.simulatorUdid) throw new Error('No simulator booted')
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    const filePath = path.join(SCREENSHOT_DIR, `ios-${name}.png`)
    takeScreenshot(this.simulatorUdid, filePath)
    return filePath
  }
}
