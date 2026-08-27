import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  GLOBAL_PROP_LOCALE,
  GLOBAL_PROP_THEME,
  SYSTEM_APPEARANCE_EVENT,
} from '../native/system-appearance.js'
import { NATIVE_EVENT } from '../native/native-audio.js'
import { BACK_PRESSED_EVENT } from '../native/navigation.js'
import { SONG_CACHE_LIMIT_ERROR } from '../features/player/data/song-cache.js'

/**
 * Gates for the host↔page contract that **only breaks on a device**.
 *
 * Every string the two hosts and the TS facades exchange — global-event names,
 * `lynx.__globalProps` keys, storage `area` values, native method names — is
 * matched by identity at runtime and by nothing at all at build time. A typo in
 * any of them compiles, typechecks, links and starts: the page just silently
 * keeps the mock audio / in-memory storage / hardcoded theme, which is exactly
 * the failure batch 21 shipped (`system-appearance.ts` header) and the one B3b
 * risked repeating across two platforms at once.
 *
 * iOS adds a second silent failure mode on top: `methodLookup` is the *only*
 * description of a module's JS surface (there is no `@LynxMethod` to discover),
 * and `project.pbxproj` is hand-written, so a file that is not registered in all
 * four places still compiles — the module is simply absent at runtime.
 */

const repoRoot = path.resolve(__dirname, '../..')
const read = (relative: string): string =>
  readFileSync(path.join(repoRoot, relative), 'utf8')

const ANDROID_AUDIO = 'android/app/src/main/java/org/songloft/lynx/audio'
const ANDROID_STORAGE = 'android/app/src/main/java/org/songloft/lynx/storage'
const ANDROID_SYSTEM = 'android/app/src/main/java/org/songloft/lynx/system'
const ANDROID_PLATFORM = 'android/app/src/main/java/org/songloft/lynx/platform'
const ANDROID_DLNA = 'android/app/src/main/java/org/songloft/lynx/dlna'
const ANDROID_LYRIC = 'android/app/src/main/java/org/songloft/lynx/lyric'
const ANDROID_VIDEO = 'android/app/src/main/java/org/songloft/lynx/video'
const ANDROID_NAV = 'android/app/src/main/java/org/songloft/lynx/navigation'
const ANDROID_CACHE = 'android/app/src/main/java/org/songloft/lynx/cache'
const IOS_DIR = 'ios/SongloftLynx'
const HARMONY_MODULES = 'harmony/entry/src/main/ets/modules'
const HARMONY_NET = 'harmony/entry/src/main/ets/net'

/** Both hosts' sources concatenated, per subsystem. */
const hosts = {
  audio: {
    android: read(`${ANDROID_AUDIO}/SongloftAudioEngine.kt`),
    ios: read(`${IOS_DIR}/SongloftAudioEngine.swift`),
    harmony: read(`${HARMONY_MODULES}/audio/SongloftAudioEngine.ets`),
  },
  audioModule: {
    android: read(`${ANDROID_AUDIO}/SongloftAudioModule.kt`),
    ios: read(`${IOS_DIR}/SongloftAudioModule.swift`),
    harmony: read(`${HARMONY_MODULES}/audio/SongloftAudioModule.ets`),
  },
  storage: {
    android: read(`${ANDROID_STORAGE}/SongloftStorageModule.kt`),
    ios: read(`${IOS_DIR}/SongloftStorageModule.swift`),
    harmony: read(`${HARMONY_MODULES}/storage/SongloftStorageModule.ets`),
  },
  system: {
    // The Android half is split: constants in SystemAppearance.kt, the two
    // delivery channels in MainActivity; iOS keeps both in the view controller.
    android:
      read(`${ANDROID_SYSTEM}/SystemAppearance.kt`) +
      read('android/app/src/main/java/org/songloft/lynx/MainActivity.kt'),
    ios: read(`${IOS_DIR}/SystemAppearance.swift`) + read(`${IOS_DIR}/ViewController.swift`),
  },
  // Batch 35+ modules (P2-3: contract gate expansion)
  platform: {
    android: read(`${ANDROID_PLATFORM}/SongloftPlatformModule.kt`),
    ios: read(`${IOS_DIR}/SongloftPlatformModule.swift`),
    harmony: read(`${HARMONY_MODULES}/platform/SongloftPlatformModule.ets`),
  },
  dlna: {
    android: read(`${ANDROID_DLNA}/SongloftDlnaModule.kt`),
    ios: read(`${IOS_DIR}/SongloftDlnaModule.swift`),
    harmony: read(`${HARMONY_MODULES}/dlna/SongloftDlnaModule.ets`),
  },
  floatingLyric: {
    android: read(`${ANDROID_LYRIC}/FloatingLyricModule.kt`),
  },
  video: {
    android: read(`${ANDROID_VIDEO}/SongloftVideoModule.kt`),
    androidActivity: read(`${ANDROID_VIDEO}/SongloftVideoActivity.kt`),
    ios: read(`${IOS_DIR}/SongloftVideoModule.swift`),
    harmony: read(`${HARMONY_MODULES}/video/SongloftVideoModule.ets`),
  },
  liveActivity: {
    ios: read(`${IOS_DIR}/LiveActivityModule.swift`),
  },
  songCache: {
    android: read(`${ANDROID_CACHE}/SongloftSongCacheModule.kt`),
    ios: read(`${IOS_DIR}/SongloftSongCacheModule.swift`),
    harmony: read(`${HARMONY_MODULES}/cache/SongloftSongCacheModule.ets`),
  },
  /*
   * Back key. Split like `system` above: the module writes the flag, but the press
   * is emitted from MainActivity, which is where the LynxView lives. No iOS half —
   * that host has no back key to intercept (no UINavigationController, so not even
   * an edge-swipe), and the TS facade degrades to an inert stub there.
   */
  navigation: {
    android:
      read(`${ANDROID_NAV}/SongloftNavigationModule.kt`) +
      read(`${ANDROID_NAV}/BackKeyState.kt`) +
      read('android/app/src/main/java/org/songloft/lynx/MainActivity.kt'),
    harmony: read(`${HARMONY_MODULES}/navigation/SongloftNavigationModule.ets`),
  },
  // Android module registration (SongloftApplication.kt)
  androidApp: read('android/app/src/main/java/org/songloft/lynx/SongloftApplication.kt'),
  // iOS module registration (ViewController.swift buildConfig)
  iosViewController: read(`${IOS_DIR}/ViewController.swift`),
  // HarmonyOS module registration (EntryAbility.ets)
  harmonyEntry: read('harmony/entry/src/main/ets/entryability/EntryAbility.ets'),
  // HarmonyOS registers per-view LynxModule classes on Index.ets (map into
  // LynxView()); EntryAbility only wires services. Registration site is not
  // the same as Android/iOS.
  harmonyIndex: read('harmony/entry/src/main/ets/pages/Index.ets'),
  // HarmonyOS module.json5 (permissions, backgroundModes)
  harmonyModuleJson: read('harmony/entry/src/main/module.json5'),
}

/** Method names declared on a TS native-module interface, in source order. */
function interfaceMethods(source: string, interfaceName: string): string[] {
  const start =
    source.indexOf(`export interface ${interfaceName} {`) !== -1
      ? source.indexOf(`export interface ${interfaceName} {`)
      : source.indexOf(`interface ${interfaceName} {`)
  expect(start, `interface ${interfaceName} not found`).toBeGreaterThan(-1)
  const body = source.slice(start, source.indexOf('\n}', start))
  return [...body.matchAll(/^\s{2}(?:\/\*\*.*)?(\w+)\??\(/gm)].map((m) => m[1] as string)
}

/**
 * Assert the Kotlin host really exposes `method` to JS.
 *
 * The **annotation** is the contract, not the function. A plain `fun x()` without
 * `@LynxMethod` compiles fine, registers nothing, and the TS facade's optional
 * call swallows the resulting no-op — exactly the failure this gate exists to
 * catch. Four call sites used to assert only `fun x(` while their failure message
 * claimed to be checking the annotation, so the gate was blind to the one thing
 * it advertised.
 */
function expectLynxMethod(source: string, method: string): void {
  expect(source, `Kotlin has no @LynxMethod ${method}`).toMatch(
    new RegExp(`@LynxMethod\\s+fun ${method}\\(`),
  )
}

/**
 * Assert the Swift host exposes `method`. Both halves are required: the method
 * itself *and* its `methodLookup` entry — a method missing from the lookup table
 * does not exist as far as JS is concerned.
 */
function expectSwiftMethod(source: string, method: string): void {
  expect(source, `Swift has no func ${method}`).toContain(`func ${method}(`)
  expect(source, `methodLookup is missing "${method}"`).toContain(`"${method}":`)
}

describe('audio global-event names reach both hosts verbatim', () => {
  const names = [...Object.values(NATIVE_EVENT)]

  test.each(names)('%s', (name) => {
    expect(hosts.audio.android, `${name} missing from the Kotlin engine`).toContain(name)
    expect(hosts.audio.ios, `${name} missing from the Swift engine`).toContain(name)
  })

  test.each(['next', 'previous', 'toggleFavorite'])(
    'remoteCommand payload value %s',
    (command) => {
      expect(hosts.audio.android).toContain(`"${command}"`)
      expect(hosts.audio.ios).toContain(`"${command}"`)
    },
  )

  /**
   * The state vocabulary is the other half of the audio contract:
   * `mapGlobalEvent` drops any `stateChanged` whose state is not in this list,
   * so a host emitting e.g. `"buffering"` produces a player that never leaves
   * its previous state.
   */
  test.each(['idle', 'loading', 'ready', 'playing', 'paused', 'completed', 'error'])(
    'stateChanged state %s',
    (state) => {
      expect(hosts.audio.android).toContain(`"${state}"`)
      expect(hosts.audio.ios).toContain(`"${state}"`)
    },
  )
})

describe('system appearance keys reach both hosts verbatim', () => {
  test.each([GLOBAL_PROP_THEME, GLOBAL_PROP_LOCALE, SYSTEM_APPEARANCE_EVENT])('%s', (key) => {
    expect(hosts.system.android, `${key} missing from the Android host`).toContain(key)
    expect(hosts.system.ios, `${key} missing from the iOS host`).toContain(key)
  })

  test.each(['light', 'dark'])('theme value %s', (value) => {
    expect(hosts.system.android).toContain(`"${value}"`)
    expect(hosts.system.ios).toContain(`"${value}"`)
  })
})

/**
 * The back key is the one contract with a **third** host: Android (Kotlin), Web
 * (`web/audio-host.js` + the worker-side module) and a no-op on iOS. Every part is a
 * silent failure — a mismatched event name means the host forwards presses nobody
 * listens for, and since the host also stops calling `super.onBackPressed()` when it
 * believes JS is handling them, the back key simply stops working.
 */
describe('the back-press event name reaches every host verbatim', () => {
  const webHost = read('web/audio-host.js')

  test('Android emits it', () => {
    expect(hosts.navigation.android).toContain(BACK_PRESSED_EVENT)
  })

  test('the Web host emits it', () => {
    expect(webHost).toContain(BACK_PRESSED_EVENT)
  })

  /**
   * `sendGlobalEvent(name, params)` takes an **array**. web-core relays `params` to
   * the worker and ends in `listener.apply(ctx, params)`, so a plain object — which
   * has no `length` — passes zero arguments and every payload arrives as
   * `undefined`. That shipped for the audio events and the appearance event; both
   * are fixed, and this keeps them fixed.
   */
  test('every Web sendGlobalEvent passes its payload as an array', () => {
    const offenders: string[] = []
    for (const file of ['web/audio-host.js', 'web/webview-host.js', 'web/index.html']) {
      read(file).split('\n').forEach((line, i) => {
        const code = line.trim()
        // Skip comments — the fix sites document the array contract in prose, and
        // `web/index.html` explains it at length right above the call it applies to.
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
        const call = /sendGlobalEvent\(([^)]*)$|sendGlobalEvent\((.*)\)/.exec(line)
        if (!call) return
        const args = (call[1] ?? call[2] ?? '').trim()
        const second = args.slice(args.indexOf(',') + 1).trim()
        if (args.includes(',') && !second.startsWith('[')) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(
      offenders,
      'sendGlobalEvent\'s second argument must be an array of params — a bare object '
      + `delivers nothing to the listener:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('native module method names exist on both hosts', () => {
  const audioMethods = interfaceMethods(
    read('src/native/native-audio.ts'),
    'SongloftAudioNativeModule',
  )
  const storageMethods = interfaceMethods(
    read('src/core/storage/native-storage.ts'),
    'SongloftStorageNativeModule',
  )

  test('the interfaces were parsed (guard against a silent empty list)', () => {
    expect(audioMethods).toContain('load')
    expect(audioMethods.length).toBeGreaterThanOrEqual(16)
    expect(storageMethods).toEqual(['getItem', 'setItem', 'removeItem', 'getKeys', 'getPath'])
  })

  test.each(audioMethods)('SongloftAudio.%s', (method) => {
    expectLynxMethod(hosts.audioModule.android, method)
    expectSwiftMethod(hosts.audioModule.ios, method)
  })

  test.each(storageMethods)('SongloftStorage.%s', (method) => {
    expectLynxMethod(hosts.storage.android, method)
    expectSwiftMethod(hosts.storage.ios, method)
  })

  /**
   * Android and the Web worker module both have to expose all three, and the Web
   * side is checked by name because it is a plain object literal with no interface
   * to typecheck against. `notifyBackHandled` is legitimately a no-op there (the
   * watchdog is Android-only) but must still exist, or the TS facade's
   * completeness probe rejects the whole module and the back key falls back to the
   * inert stub — i.e. browser back stops being intercepted at all.
   */
  const navigationMethods = interfaceMethods(
    read('src/native/navigation.ts'),
    'SongloftNavigationNativeModule',
  )

  test('the navigation interface was parsed', () => {
    expect(navigationMethods).toEqual(['setBackConsumable', 'notifyBackHandled', 'exitApp'])
  })

  test.each(navigationMethods)('SongloftNavigation.%s', (method) => {
    expectLynxMethod(hosts.navigation.android, method)
    expect(
      read('web/songloft-navigation-module.js'),
      `the Web worker module has no ${method}`,
    ).toMatch(new RegExp(`\\b${method}\\(`))
    expect(
      read('web/audio-host.js'),
      `the Web main thread has no ${method} handler`,
    ).toMatch(new RegExp(`${method}:\\s*function`))
  })

  /**
   * Only `"secure"` is asserted: both hosts distinguish the two areas with a
   * single comparison against it and treat everything else as `prefs`, so the
   * `prefs` string legitimately never appears in either source. Getting the
   * `secure` spelling wrong is the dangerous half anyway — tokens would land in
   * the non-sensitive store while `secure.get` kept reading the empty one.
   */
  test('the secure storage area spelling matches on both hosts', () => {
    expect(hosts.storage.android).toContain('"secure"')
    expect(hosts.storage.ios).toContain('"secure"')
  })
})

/**
 * `ios/SongloftLynx.xcodeproj/project.pbxproj` is hand-written (B3a: the
 * CocoaPods parts are written back by `pod install`, the rest is ours). A new
 * Swift file has to appear in **four** sections; miss the build-phase entry and
 * the target still builds, just without that file — for a native module that
 * means `NativeModules.SongloftAudio` is undefined and the app silently plays
 * nothing.
 */
describe('every iOS Swift source is registered in the hand-written pbxproj', () => {
  const pbxproj = read(`${IOS_DIR}.xcodeproj/project.pbxproj`)
  const swiftFiles = readdirSync(path.join(repoRoot, IOS_DIR)).filter((f) => f.endsWith('.swift'))

  test('the host has Swift sources at all', () => {
    expect(swiftFiles.length).toBeGreaterThanOrEqual(8)
  })

  test.each(swiftFiles)('%s', (file) => {
    const section = (name: string): string => {
      const start = pbxproj.indexOf(`/* Begin ${name} section */`)
      const end = pbxproj.indexOf(`/* End ${name} section */`)
      expect(start, `${name} section missing`).toBeGreaterThan(-1)
      return pbxproj.slice(start, end)
    }
    expect(section('PBXFileReference'), 'no PBXFileReference').toContain(`path = ${file}`)
    expect(section('PBXBuildFile'), 'no PBXBuildFile').toContain(`${file} in Sources`)
    expect(section('PBXGroup'), 'not in the SongloftLynx group children').toContain(`/* ${file} */`)
    expect(section('PBXSourcesBuildPhase'), 'not compiled — missing from Sources').toContain(
      `${file} in Sources`,
    )
  })
})

/**
 * The registration checks above are substring containment — and that is exactly
 * how a broken pbxproj slipped past them. Batch 39 pasted a `PBXBuildFile`
 * assignment *inside* the `PBXSourcesBuildPhase` `files = ( … );` array; because
 * the malformed line still contains `SongloftDlnaModule.swift in Sources`, all
 * four assertions stayed green while `xcodebuild -list` failed outright and iOS
 * could not be built for two entire batches.
 *
 * A gate that only proves a string is present cannot prove the file parses. So
 * check structure too. This runs everywhere (no Xcode needed) and targets the
 * failure class directly: the body of an element list may hold list entries and
 * nothing else — an `{isa = …}` object assignment there means the file is
 * corrupt, no matter which identifiers appear in it.
 */
describe('the hand-written pbxproj is structurally well-formed', () => {
  const pbxproj = read(`${IOS_DIR}.xcodeproj/project.pbxproj`)

  /** Drop `/* … *​/` comments and quoted strings so their punctuation is not counted. */
  const sanitize = (line: string): string =>
    line.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"/g, '')

  test('no object assignment leaks into an element list body', () => {
    let depth = 0
    const offenders: string[] = []
    pbxproj.split('\n').forEach((line, index) => {
      if (depth > 0 && line.includes('{isa =')) {
        offenders.push(`line ${index + 1}: ${line.trim()}`)
      }
      for (const ch of sanitize(line)) {
        if (ch === '(') depth += 1
        else if (ch === ')') depth -= 1
      }
    })
    expect(
      offenders,
      'a PBXBuildFile-style assignment belongs in its own section, never inside a files/children list',
    ).toEqual([])
  })

  test('parens and braces are balanced', () => {
    const body = sanitize(pbxproj)
    const count = (ch: string): number => body.split(ch).length - 1
    expect(count('('), 'unbalanced parens').toBe(count(')'))
    expect(count('{'), 'unbalanced braces').toBe(count('}'))
  })
})

/**
 * Background playback needs the Info.plist declaration *and* the `.playback`
 * audio session; either alone is silent. iOS suspends the app on backgrounding
 * without the plist key, so playback stops on screen lock — the same class of
 * defect as Android missing its foreground service.
 */
test('iOS declares the audio background mode and activates a playback session', () => {
  const plist = read(`${IOS_DIR}/Info.plist`)
  expect(plist).toContain('<key>UIBackgroundModes</key>')
  expect(plist.slice(plist.indexOf('UIBackgroundModes'))).toContain('<string>audio</string>')
  expect(hosts.audio.ios).toMatch(/setCategory\(\.playback/)
})

/**
 * Info.plist gets the same structural treatment as the pbxproj above, and for the
 * same reason: every other assertion against it is a substring check, and a
 * substring check cannot tell a well-formed file from one that merely contains
 * the right characters. A malformed plist fails at build/launch time, which this
 * repo has already learned is far too late (batch 39's pbxproj).
 */
describe('the iOS Info.plist is structurally well-formed', () => {
  const plist = read(`${IOS_DIR}/Info.plist`)

  test('tags are balanced and properly nested', () => {
    const withoutComments = plist.replace(/<!--[\s\S]*?-->/g, '')
    const stack: string[] = []
    const mismatches: string[] = []
    for (const [, closing, name, selfClosing] of withoutComments.matchAll(
      /<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g,
    )) {
      if (selfClosing === '/') continue
      if (closing === '/') {
        if (stack.pop() !== name) mismatches.push(`unexpected </${name}>`)
      } else {
        stack.push(name as string)
      }
    }
    expect(mismatches, 'malformed plist markup').toEqual([])
    expect(stack, 'unclosed plist tags').toEqual([])
  })

  test('every <key> has a sibling value element', () => {
    // `<key>` followed immediately by another `<key>` means a value went missing,
    // which the XML parser accepts and the plist loader silently mis-reads.
    expect(plist).not.toMatch(/<key>[^<]*<\/key>\s*<key>/)
  })

  /**
   * `NSAllowsArbitraryLoads` had no gate at all, while a comment in this very
   * file credited it with something it cannot do (accepting self-signed certs —
   * that is `InsecureTls`'s job). It is still needed for plain-HTTP servers,
   * which is the common LAN setup, so it is pinned here.
   */
  test('ATS still permits cleartext HTTP for LAN servers', () => {
    expect(plist).toContain('<key>NSAppTransportSecurity</key>')
    expect(plist).toMatch(/<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/)
  })
})

// ── Batch 35+ modules (P2-3 contract gate expansion) ─────────────────────────

/**
 * The plugin iframe is **Web-only**: the native builds render a real `<webview>`
 * element and never see this module. The contract therefore runs between three
 * files in the Web deployable — the TS facade (`src/native/web-webview.ts`),
 * the worker-side ESM module (`web/songloft-webview-module.js`) and the
 * main-thread handler (`web/webview-host.js`). Every name is matched by
 * identity at runtime and by nothing at build time, the same failure class as
 * the rest of this file: a renamed method or event silently degrades the
 * plugin tab to the "webview unavailable" message.
 */
describe('SongloftWebview module surface (Web only)', () => {
  const methods = interfaceMethods(
    read('src/native/web-webview.ts'),
    'SongloftWebviewNativeModule',
  )

  test('the interface was parsed (guard against a silent empty list)', () => {
    expect(methods).toEqual(['open', 'postMessage', 'close'])
  })

  test.each(methods)('SongloftWebview.%s reaches both Web halves', (method) => {
    expect(
      read('web/songloft-webview-module.js'),
      `the Web worker module has no ${method}`,
    ).toMatch(new RegExp(`\\b${method}\\(`))
    expect(
      read('web/webview-host.js'),
      `the Web main thread has no ${method} handler`,
    ).toMatch(new RegExp(`${method}:\\s*function`))
  })

  /**
   * The event names have three hard-coded spellings: the facade's constants,
   * the main thread's `sendGlobalEvent` calls, and nothing in between. `load`
   * is deliberately absent — the main thread emits it but no worker code
   * listens yet (diagnostics / future internal-history support).
   */
  test('the webview event names match between the facade and the main thread', () => {
    for (const name of ['SongloftWebview.message', 'SongloftWebview.openFailed']) {
      expect(
        read('src/native/web-webview.ts'),
        `the facade does not declare ${name}`,
      ).toContain(name)
      expect(
        read('web/webview-host.js'),
        `the main thread does not emit ${name}`,
      ).toContain(name)
    }
  })

  /**
   * The iframe follows a placeholder element the main thread resolves by
   * selector inside lynx-view's shadow root (ResizeObserver + resize). That
   * only works if the id the page renders and the selector the page sends are
   * the same string — a rename on one side strands the iframe in the 3-second
   * placeholder poll and the tab degrades to the "unavailable" message.
   */
  test('the placeholder id matches between the page and the open call', () => {
    const page = read('src/features/jsplugin/pages/PluginWebViewPage.tsx')
    expect(page, 'the page must render the placeholder with that id').toContain(
      "id='plugin-webview-frame'",
    )
    expect(page, 'the page must open the iframe with the same selector').toContain(
      "'#plugin-webview-frame'",
    )
  })

  /**
   * THE layering contract, browser-probe-verified (see webview-host.js's
   * `ensureIframe` comment): `contain: strict` makes lynx-view a stacking
   * context, so a body-level frame outranks EVERY app overlay and can only be
   * fought by hiding it (which reads as the plugin vanishing). Mounted inside
   * the shadow root instead, the frame joins the app's own stacking context
   * and z-index works: page content (auto) under the frame (50) under the nav
   * capsule (90) / mini-player (91) / sheets (100) / dialogs (200/201). Both
   * halves of that arrangement live in main-thread JS that no typechecker
   * sees, so pin them here: the mount point AND the z-index value.
   */
  test('the iframe mounts into the shadow root at the content layer', () => {
    const host = read('web/webview-host.js')
    expect(
      host,
      'the iframe must append into lynxView.shadowRoot — a body-level frame outranks every app overlay',
    ).toMatch(/lynxView\.shadowRoot[^;]*appendChild/)
    expect(
      host,
      "the frame's z-index must sit between page content and the nav capsule (90)",
    ).toMatch(/el\.style\.zIndex = '50'/)
    // And the toast pill must clear the frame — it lands inside its rect on
    // plugin tabs (fixed layers carry their own z-index, AGENTS.md).
    expect(
      read('src/shared/ui/ToastHost.css'),
      'the toast pill needs a z-index above the plugin frame (50)',
    ).toMatch(/\.toast-wrap[\s\S]{0,1200}?z-index:\s*1\d\d/)
  })
})

describe('SongloftPlatform module methods exist on both hosts', () => {
  const methods = interfaceMethods(
    read('src/native/native-platform.ts'),
    'SongloftPlatformNative',
  )

  test('the interface was parsed', () => {
    expect(methods).toContain('openURL')
    expect(methods.length).toBeGreaterThanOrEqual(3)
  })

  // `setInsecureTls` used to be excluded here, with a note claiming iOS covered
  // it via "ATS plist + custom URLSessionDelegate". Only the plist half existed,
  // and ATS relaxes *cleartext HTTP* — it has no bearing on certificate
  // validation, so self-signed servers were simply unreachable on iOS. Now that
  // both hosts implement it, it belongs in the main loop like everything else.
  test.each(methods)('SongloftPlatform.%s', (method) => {
    expectLynxMethod(hosts.platform.android, method)
    expectSwiftMethod(hosts.platform.ios, method)
  })
})

describe('SongloftDlna module methods exist on both hosts', () => {
  const methods = interfaceMethods(
    read('src/native/dlna.ts'),
    'NativeDlnaModule',
  )

  test('the interface was parsed', () => {
    expect(methods).toContain('startDiscovery')
    expect(methods.length).toBeGreaterThanOrEqual(5)
  })

  test.each(methods)('SongloftDlna.%s', (method) => {
    expectLynxMethod(hosts.dlna.android, method)
    expectSwiftMethod(hosts.dlna.ios, method)
  })
})

describe('SongloftFloatingLyric module methods exist on Android', () => {
  // The TS interface is in floating-lyric.ts (Promise-shaped, no native interface).
  // The native methods are: requestPermission, show, updateLyric, hide, isShowing.
  const methods = ['requestPermission', 'show', 'updateLyric', 'hide', 'isShowing', 'setFontSize', 'setLocked', 'setOpacity']

  test.each(methods)('FloatingLyricModule.%s has @LynxMethod and uses Callback', (method) => {
    const src = hosts.floatingLyric.android
    // Each method must carry @LynxMethod so Lynx discovers it.
    expect(
      src,
      `FloatingLyricModule.${method} is missing @LynxMethod — it is invisible to JS`,
    ).toMatch(new RegExp(`@LynxMethod\\s+fun ${method}\\(`))
    // The method signature must use com.lynx.react.bridge.Callback, not a Kotlin
    // lambda. A lambda is not a registered Lynx type and silently fails.
    expect(
      src,
      `FloatingLyricModule.${method} must use Callback, not a plain lambda`,
    ).toMatch(new RegExp(`fun ${method}\\([^)]*callback:\\s*Callback`))
  })
})

/**
 * Fullscreen video: the module surface plus the two things that are invisible from
 * JS and only observable on a device.
 *
 * The whole design rests on the video screen borrowing the **one** player rather than
 * opening a second one, and both halves of that borrowing fail silently:
 * `attachVideoOutput` missing means the screen opens onto nothing (a black rectangle
 * with audio), and `detachVideoOutput` missing means ExoPlayer keeps drawing into a
 * destroyed window and the *next* audio-only track dies inside the video renderer.
 */
describe('SongloftVideo module surface (Android)', () => {
  const methods = interfaceMethods(read('src/native/video.ts'), 'NativeVideoModule')

  test('the interface was parsed (guard against a silent empty list)', () => {
    expect(methods).toEqual(['open', 'close', 'isOpen'])
  })

  test.each(methods)('SongloftVideoModule.%s has @LynxMethod and uses Callback', (method) => {
    expectLynxMethod(hosts.video.android, method)
    expect(
      hosts.video.android,
      `SongloftVideoModule.${method} must take a Callback, not a Kotlin lambda`,
    ).toMatch(new RegExp(`fun ${method}\\([^)]*callback:\\s*Callback`))
  })

  test('the close event name matches the TS listener verbatim', () => {
    expect(hosts.video.android).toContain('SongloftVideo.closed')
  })

  test('the engine can lend out a surface, and the screen hands it back', () => {
    expect(
      hosts.audio.android,
      'engine exposes no attachVideoOutput — the video screen would open onto nothing',
    ).toContain('fun attachVideoOutput')
    expect(hosts.audio.android).toContain('fun detachVideoOutput')
    expect(
      hosts.video.androidActivity,
      'the video screen never detaches: ExoPlayer would keep drawing into a dead window',
    ).toContain('detachVideoOutput')
  })

  test('the screen touches the player only on the main thread', () => {
    // A `@LynxMethod` arrives on the BTS thread and ExoPlayer is main-thread-only.
    // Batch 48 shipped the same mistake in FloatingLyricService, where the resulting
    // CalledFromWrongThreadException was swallowed by a bare catch.
    expect(hosts.video.androidActivity).toContain('runOnMain')
    expect(hosts.video.android).toContain('runOnMain')
  })

  test('the host refuses to open a screen with no video track', () => {
    // `songs.is_video` comes from the original file at scan time; a remote song may be
    // served from a cache entry transcoded with `-vn`. Only the host can tell.
    expect(hosts.video.android).toContain('hasVideoTrack')
    expect(hosts.audio.android).toContain('fun hasVideoTrack')
  })
})

describe('SongloftVideo module surface (iOS)', () => {
  const methods = interfaceMethods(read('src/native/video.ts'), 'NativeVideoModule')

  test.each(methods)('SongloftVideoModule.%s exists in Swift with methodLookup', (method) => {
    expectSwiftMethod(hosts.video.ios, method)
  })

  test('the close event name matches the TS listener verbatim', () => {
    expect(hosts.video.ios).toContain('SongloftVideo.closed')
  })

  test('the engine can lend out the player, and the module hands it back', () => {
    expect(
      hosts.audio.ios,
      'engine exposes no attachVideoOutput — the video screen would open onto nothing',
    ).toContain('func attachVideoOutput')
    expect(hosts.audio.ios).toContain('func detachVideoOutput')
    expect(
      hosts.video.ios,
      'the video module never detaches: AVPlayer would keep feeding a dismissed vc',
    ).toContain('detachVideoOutput')
  })

  test('updatesNowPlayingInfoCenter is disabled', () => {
    expect(
      hosts.video.ios,
      'AVPlayerViewController would overwrite our lock-screen metadata without this',
    ).toContain('updatesNowPlayingInfoCenter = false')
  })

  test('player is nil-ed before dismiss to prevent AVPlayerViewController from pausing', () => {
    const src = hosts.video.ios
    const nilIndex = src.indexOf('vc.player = nil')
    const dismissIndex = src.indexOf('dismiss(animated:')
    expect(nilIndex, 'vc.player = nil must appear').toBeGreaterThan(-1)
    expect(dismissIndex, 'dismiss must appear').toBeGreaterThan(-1)
    expect(nilIndex, 'vc.player = nil must come before dismiss').toBeLessThan(dismissIndex)
  })

  test('the host refuses to open when there is no video track', () => {
    expect(hosts.video.ios).toContain('hasVideoTrack')
    expect(hosts.audio.ios).toContain('func hasVideoTrack')
  })
})

describe('SongloftLiveActivity is a proper Lynx module on iOS', () => {
  const src = hosts.liveActivity.ios
  const methods = ['start', 'update', 'end']

  test('LiveActivityModule is a class (not an enum) and conforms to LynxModule', () => {
    // An enum cannot be registered as a Lynx module; it must be a class.
    expect(src, 'LiveActivityModule must be a class, not an enum').toContain('class LiveActivityModule')
    expect(src, 'LiveActivityModule must conform to LynxModule').toContain('LynxModule')
  })

  test('LiveActivityModule has @objc, name, and methodLookup', () => {
    expect(src, 'LiveActivityModule must have @objc methods').toContain('@objc')
    expect(src, 'static var name is required for Lynx module registration').toContain('static var name')
    expect(src, 'methodLookup is required — JS methods are invisible without it').toContain('methodLookup')
  })

  test.each(methods)('LiveActivityModule.%s is in methodLookup', (method) => {
    expect(src, `methodLookup is missing "${method}"`).toContain(`"${method}":`)
  })
})

/**
 * On-device song cache. The method surface plus the invariants that are invisible
 * from JS and only bite on a device:
 *
 *  - storage must not live in the OS cache dir (the OS evicts it, dropping files
 *    the user explicitly saved);
 *  - downloads must honour the insecure-TLS switch (a self-signed server is the
 *    common LAN case);
 *  - callbacks must hand back a playable `file://` URL, never a bare path the audio
 *    engine cannot load, and never a hand-concatenated one (breaks on spaces/CJK);
 *  - downloads must commit atomically, so a crash never leaves a half-written file
 *    reported as playable;
 *  - the byte-cap sentinel must be the exact string the TS facade matches on.
 */
describe('SongloftSongCache module methods exist on both hosts', () => {
  const methods = interfaceMethods(
    read('src/features/player/data/song-cache.ts'),
    'NativeSongCacheModule',
  )

  test('the interface was parsed (guard against a silent empty list)', () => {
    expect(methods).toContain('getCacheInfo')
    expect(methods.length).toBeGreaterThanOrEqual(5)
  })

  test.each(methods)('SongloftSongCache.%s', (method) => {
    expectLynxMethod(hosts.songCache.android, method)
    expectSwiftMethod(hosts.songCache.ios, method)
  })

  test.each(methods)('%s takes a bridge Callback, not a Kotlin lambda', (method) => {
    expect(hosts.songCache.android).toMatch(
      new RegExp(`fun ${method}\\([^)]*callback:\\s*Callback`),
    )
  })
})

describe('SongloftSongCache keeps its on-device invariants', () => {
  test('downloads honour the insecure-TLS switch on both hosts', () => {
    expect(hosts.songCache.android).toContain('clientFor(InsecureTls.enabled)')
    expect(hosts.songCache.ios).toContain('InsecureTls.shared.session')
  })

  test('cache lives in non-evictable storage, not the OS cache dir', () => {
    expect(hosts.songCache.android).toContain('.filesDir')
    expect(hosts.songCache.android).not.toContain('ctx.cacheDir')
    expect(hosts.songCache.ios).toContain('.documentDirectory')
    expect(hosts.songCache.ios).not.toContain('.cachesDirectory')
  })

  test('callbacks hand back a playable file:// URL, never a hand-built one', () => {
    expect(hosts.songCache.android).toContain('Uri.fromFile')
    expect(hosts.songCache.ios).toContain('absoluteString')
    expect(hosts.songCache.android).not.toContain('"file://')
    expect(hosts.songCache.ios).not.toContain('"file://')
  })

  test('downloads commit atomically (no half-written playable file)', () => {
    expect(hosts.songCache.android).toContain('renameTo')
    expect(hosts.songCache.ios).toContain('moveItem')
  })

  test('the byte-cap sentinel is shared verbatim with the TS facade', () => {
    expect(hosts.songCache.android).toContain(SONG_CACHE_LIMIT_ERROR)
    expect(hosts.songCache.ios).toContain(SONG_CACHE_LIMIT_ERROR)
  })
})

describe('every native module is registered in the host bootstrap', () => {
  const modules = [
    { name: 'SongloftAudio', android: 'SongloftAudioModule', ios: 'SongloftAudioModule', harmony: 'SongloftAudioModule' },
    { name: 'SongloftStorage', android: 'SongloftStorageModule', ios: 'SongloftStorageModule', harmony: 'SongloftStorageModule' },
    { name: 'SongloftPlatform', android: 'SongloftPlatformModule', ios: 'SongloftPlatformModule', harmony: 'SongloftPlatformModule' },
    { name: 'SongloftDlna', android: 'SongloftDlnaModule', ios: 'SongloftDlnaModule', harmony: 'SongloftDlnaModule' },
    { name: 'SongloftFloatingLyric', android: 'FloatingLyricModule', ios: null, harmony: null },
    { name: 'SongloftLiveActivity', android: null, ios: 'LiveActivityModule', harmony: null },
    { name: 'SongloftVideo', android: 'SongloftVideoModule', ios: 'SongloftVideoModule', harmony: 'SongloftVideoModule' },
    { name: 'SongloftNavigation', android: 'SongloftNavigationModule', ios: null, harmony: 'SongloftNavigationModule' },
    { name: 'SongloftSongCache', android: 'SongloftSongCacheModule', ios: 'SongloftSongCacheModule', harmony: 'SongloftSongCacheModule' },
  ]

  test.each(modules.filter((m) => m.android))('%s is registered on Android', (mod) => {
    expect(
      hosts.androidApp,
      `${mod.name} not registered in SongloftApplication.kt`,
    ).toContain(`registerModule("${mod.name}", ${mod.android}::class.java)`)
  })

  /**
   * Narrowed three ways, each closing a hole the previous version had:
   *  - to the `buildConfig()` body, not the whole file (a mention in an import or
   *    a doc comment elsewhere used to satisfy it);
   *  - to the actual `config.register(…)` call, not the bare class name;
   *  - **with comments stripped**, because a commented-out registration still
   *    contains the call as a substring. Verified by commenting one out and
   *    watching this go red — the un-stripped version stayed green, which is the
   *    same substring-vs-semantics trap as batch 39's pbxproj gate.
   */
  const buildConfigBody = ((): string => {
    const start = hosts.iosViewController.indexOf('private static func buildConfig()')
    expect(start, 'buildConfig() not found in ViewController.swift').toBeGreaterThan(-1)
    return hosts.iosViewController
      .slice(start, hosts.iosViewController.indexOf('\n  }', start))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
  })()

  test.each(modules.filter((m) => m.ios))('%s is registered on iOS', (mod) => {
    expect(
      buildConfigBody,
      `${mod.name} not registered in ViewController.swift buildConfig`,
    ).toContain(`config.register(${mod.ios!}.self)`)
  })

  test.each(modules.filter((m) => m.harmony))('%s is registered on HarmonyOS', (mod) => {
    expect(
      hosts.harmonyIndex,
      `${mod.name} not registered in Index.ets (Harmony wires modules per-LynxView, ` +
      `not through a global LynxEnv.registerModule the way Android/iOS do)`,
    ).toContain(`.set('${mod.name}', { moduleClass: ${mod.harmony!}`)
  })
})

/**
 * The host HTTP service backs the bare global `fetch`, so losing it breaks every
 * request in the app. Batch 45 replaced the SDK's implementation on both hosts to
 * get a TLS hook (`InsecureTls`), which means there is no longer a stock service
 * to silently fall back to — hence a gate.
 *
 * The iOS half also asserts the *absence* of the pod: our service and the SDK's
 * would otherwise both bind `LynxServiceHttpProtocol`, with no documented winner.
 */
describe('the host HTTP service is ours, on both hosts', () => {
  test('Android registers SongloftHttpService instead of the SDK one', () => {
    expect(hosts.androidApp).toContain('registerService(SongloftHttpService)')
    expect(
      hosts.androidApp,
      'the SDK LynxHttpService is registered too — two implementations of ILynxHttpService',
    ).not.toContain('registerService(LynxHttpService)')
  })

  test('iOS registers SongloftHttpService and drops the LynxService/Http subspec', () => {
    const appDelegate = read(`${IOS_DIR}/AppDelegate.swift`)
    expect(appDelegate).toContain('LynxServices.registerService(')
    expect(appDelegate).toContain('SongloftHttpService.self')
    expect(appDelegate).toContain('NSProtocolFromString("LynxServiceHttpProtocol")')

    // Registration has to follow the lazy-register flush that touching
    // `LynxEnv.sharedInstance()` performs, or the pods' self-registrations
    // could land afterwards.
    expect(appDelegate.indexOf('LynxEnv.sharedInstance()')).toBeLessThan(
      appDelegate.indexOf('registerHttpService()'),
    )

    const podfile = read('ios/Podfile')
    const lynxService = podfile.slice(
      podfile.indexOf("pod 'LynxService'"),
      podfile.indexOf(']', podfile.indexOf("pod 'LynxService'")),
    )
    expect(lynxService, 'Podfile still pulls LynxService/Http').not.toContain("'Http'")
  })

  test('HarmonyOS registers SongloftHttpService in EntryAbility', () => {
    expect(hosts.harmonyEntry).toContain('SongloftHttpService.register')
  })
})

describe('HarmonyOS module.json5 declares required permissions and background modes', () => {
  const moduleJson = JSON.parse(hosts.harmonyModuleJson)
  const permissions = (moduleJson.module.requestPermissions ?? []).map(
    (p: { name: string }) => p.name,
  )
  const abilities = moduleJson.module.abilities ?? []
  const mainAbility = abilities.find((a: { name: string }) => a.name === 'EntryAbility')

  test('INTERNET permission is declared', () => {
    expect(permissions).toContain('ohos.permission.INTERNET')
  })

  test('KEEP_BACKGROUND_RUNNING permission is declared (required for long-running task)', () => {
    expect(permissions).toContain('ohos.permission.KEEP_BACKGROUND_RUNNING')
  })

  test('MULTICAST permission is declared (required for DLNA SSDP discovery)', () => {
    expect(permissions).toContain('ohos.permission.MULTICAST')
  })

  test('audioPlayback backgroundMode is declared on the main ability', () => {
    expect(mainAbility).toBeDefined()
    expect(mainAbility.backgroundModes).toContain('audioPlayback')
  })

  test('module.json5 is structurally valid JSON5', () => {
    expect(moduleJson.module.name).toBe('entry')
    expect(moduleJson.module.type).toBe('entry')
    expect(moduleJson.module.mainElement).toBe('EntryAbility')
  })
})
