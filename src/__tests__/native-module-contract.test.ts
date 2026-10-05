import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  GLOBAL_PROP_SAFE_BOTTOM,
  GLOBAL_PROP_SAFE_LEFT,
  GLOBAL_PROP_SAFE_RIGHT,
  GLOBAL_PROP_SAFE_TOP,
  SAFE_AREA_EVENT,
} from '../native/safe-area.js'
import {
  GLOBAL_PROP_LOCALE,
  GLOBAL_PROP_THEME,
  SYSTEM_APPEARANCE_EVENT,
} from '../native/system-appearance.js'
import { NATIVE_EVENT } from '../native/native-audio.js'
import { BACK_PRESSED_EVENT } from '../native/navigation.js'
import { APP_RESUMED_EVENT } from '../native/app-lifecycle.js'
import { SONG_CACHE_LIMIT_ERROR } from '../features/player/data/song-cache.js'
import { REQUEST_TIMEOUT_HEADER } from '../core/network/http-client.js'

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

test('Android onResume emits the lifecycle event consumed by plugin WebViews', () => {
  const activity = read('android/app/src/main/java/org/songloft/lynx/MainActivity.kt')
  const event = activity.match(/const val EVENT_APP_RESUMED = "([^"]+)"/)
  expect(event?.[1]).toBe(APP_RESUMED_EVENT)
  const onResume = activity.match(/override fun onResume\(\)\s*\{([\s\S]*?)\n    \}/)?.[1]
  expect(onResume).toBeDefined()
  expect(onResume).toMatch(/super\.onResume\(\)/)
  expect(onResume).toMatch(/val params = JavaOnlyArray\(\)/)
  expect(onResume).toMatch(/params\.pushMap\(JavaOnlyMap\.from\(emptyMap<String, Any>\(\)\)\)/)
  expect(onResume).toMatch(/lynxView\?\.sendGlobalEvent\(EVENT_APP_RESUMED, params\)/)
})

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
    androidMain: read('android/app/src/main/java/org/songloft/lynx/MainActivity.kt'),
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

/** Assert a HarmonyOS LynxModule exposes a public ArkTS method to JS. */
function expectArkTsMethod(source: string, method: string): void {
  // `public async foo(` and `public foo(` both count — Lynx bridges through
  // whatever the JS surface names, and an async method that returns a Promise
  // is a first-class member of the bridge (see SongloftVideoModule).
  expect(source, `HarmonyOS has no public ${method}`).toMatch(
    new RegExp(`public\\s+(?:async\\s+)?${method}\\(`),
  )
}

describe('audio global-event names reach both hosts verbatim', () => {
  const names = [...Object.values(NATIVE_EVENT)]

  test.each(names)('%s', (name) => {
    expect(hosts.audio.android, `${name} missing from the Kotlin engine`).toContain(name)
    expect(hosts.audio.ios, `${name} missing from the Swift engine`).toContain(name)
  })

  test.each(['next', 'previous', 'toggleFavorite'])(
    'remoteCommand payload value %s in both platforms',
    (command) => {
      expect(hosts.audio.android).toContain(`"${command}"`)
      expect(hosts.audio.ios).toContain(`"${command}"`)
    },
  )

  test('remoteCommand payload value stop exists in Android', () => {
    expect(hosts.audio.android).toContain('"stop"')
    // TODO(songloft-org/songloft#452): add stop command to iOS when implementing
    // the stop/exit button on the iOS client.
  })

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
 * Safe-area insets — **iOS only**, and that is the contract, not an omission.
 *
 * The page reads the insets from `env(safe-area-inset-*)` by default (`tokens.css`),
 * which is correct on Web and irrelevant on Android/HarmonyOS: those two lay the
 * page out below the status bar, so their insets are zero by construction. iOS is
 * the one host that renders full-screen *and* cannot resolve `env()` (it returns 0
 * on Lynx 4.0.1 — see `native/safe-area.ts`), so it is the one host that has to
 * measure and push.
 *
 * Same silent-failure shape as the appearance keys above, one step worse: a drifted
 * key here does not fall back to a wrong-but-visible value, it falls back to zero
 * insets, i.e. content under the Dynamic Island and the home indicator, with nothing
 * logged. The `ios-safe-area` scenario covers the runtime half; this covers the
 * strings, which is the half that compiles either way.
 */
describe('safe-area keys reach the iOS host verbatim', () => {
  test.each([
    GLOBAL_PROP_SAFE_TOP,
    GLOBAL_PROP_SAFE_BOTTOM,
    GLOBAL_PROP_SAFE_LEFT,
    GLOBAL_PROP_SAFE_RIGHT,
    SAFE_AREA_EVENT,
  ])('%s', (key) => {
    expect(hosts.system.ios, `${key} missing from the iOS host`).toContain(key)
  })

  /**
   * The push has to exist and be *wired*, not just have its constants declared.
   *
   * Both assertions below were substring checks on the whole file when first
   * written, and reverse-verification caught both being vacuous:
   *  - renaming `viewSafeAreaInsetsDidChange` to a private unused function kept
   *    the substring present, so the override could be deleted and stay green;
   *  - `SafeAreaInsets.snapshot` also appears in the `loadTemplate` globalProps
   *    merge, so gutting the *push* kept the substring present too.
   * That is AGENTS.md §5.3's "闸门验证语义和结构，不只查子串" — so these now match
   * the declaration shape and scope the body check to the function itself.
   */
  test('the iOS host observes inset changes with a real UIViewController override', () => {
    // The exact override signature: an `override func`, not any mention of the name.
    expect(hosts.system.ios).toMatch(/override\s+func\s+viewSafeAreaInsetsDidChange\s*\(\s*\)/)
    // And it must actually route to the push. Extract the override's body rather
    // than trusting the file: a renamed/detached override would otherwise pass.
    const body = swiftFuncBody(hosts.system.ios, 'viewSafeAreaInsetsDidChange')
    expect(body, 'viewSafeAreaInsetsDidChange must call pushSafeArea()').toContain('pushSafeArea()')
  })

  test('pushSafeArea snapshots the insets and sends both channels', () => {
    const body = swiftFuncBody(hosts.system.ios, 'pushSafeArea')
    expect(body, 'pushSafeArea must build its payload from SafeAreaInsets.snapshot')
      .toMatch(/SafeAreaInsets\.snapshot\s*\(\s*insets:/)
    // globalProps alone does not reach an already-rendered tree — the event is the
    // half that makes rotation work. Both, or the live page never hears a change.
    expect(body).toContain('updateGlobalProps')
    expect(body).toMatch(/sendGlobalEvent\s*\(\s*SafeAreaInsets\.eventChanged/)
  })
})

/**
 * The body of a Swift function, brace-matched from its declaration.
 *
 * Needed because "the file mentions X" is not "the function that should do X does
 * X" — see the reverse-verification note above. Returns `''` when the declaration
 * is absent, so every assertion against it fails rather than passing vacuously.
 */
function swiftFuncBody(source: string, name: string): string {
  const start = source.search(new RegExp(`func\\s+${name}\\s*\\(`))
  if (start < 0) return ''
  const open = source.indexOf('{', start)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return ''
}

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

  test('HarmonyOS forwards the facade-normalized 0–1 volume without scaling it again', () => {
    expect(hosts.audioModule.harmony).toMatch(
      /public setVolume\(volume: number\): void \{\s*this\.engine\?\.setVolume\(volume\)\s*\}/,
    )
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
    expect(methods).toEqual(['open', 'postMessage', 'hide', 'close'])
  })

  /*
   * `hide` is load-bearing, not a convenience: leaving a plugin page must NOT
   * detach the frame (that detach crashed the renderer with error code 11 — see
   * docs/archive/web-plugin-tab-crash.md), so the page's cleanup calls `hide` and
   * only the plugin manager / logout call `close`. If a refactor ever routes the
   * cleanup back through `close`, the crash comes back silently — hence a gate on
   * the call site rather than only on the module surface.
   */
  test('leaving the Web plugin page hides the frame, never closes it', () => {
    const page = read('src/features/jsplugin/pages/PluginWebViewPage.tsx')
    expect(page, 'the Web plugin page never calls hide()').toMatch(/webview\.hide\(/)
    expect(page, 'the Web plugin page must not close() the frame on unmount')
      .not.toMatch(/webview\.close\(/)

    const lynxFrame = read('src/features/jsplugin/widgets/LynxPluginFrame.tsx')
    expect(lynxFrame, 'the lynx plugin frame never calls hide()').toMatch(/mod\.hide\(/)
    expect(lynxFrame, 'the lynx plugin frame must not close() on unmount')
      .not.toMatch(/mod\.close\(/)
  })

  /**
   * The lynx render engine had NO contract gate at all, which is how its two
   * module URLs and its host script stayed missing from the deploy list for as
   * long as the engine existed (see `web-host-page.test.ts` and
   * docs/archive/web-plugin-tab-crash.md). Same shape as the webview block above.
   */
  test('every SongloftLynxFrame method reaches both Web halves', () => {
    const methods = interfaceMethods(
      read('src/native/web-lynx-frame.ts'),
      'LynxFrameNativeModule',
    )
    expect(methods).toEqual([
      'open', 'updateGlobalProps', 'sendEvent', 'hostReply', 'hide', 'close',
    ])
    for (const method of methods) {
      expect(
        read('web/songloft-lynx-frame-module.js'),
        `the Web worker module has no ${method}`,
      ).toMatch(new RegExp(`\\b${method}\\(`))
      expect(
        read('web/lynx-frame-host.js'),
        `the Web main thread has no ${method} handler`,
      ).toMatch(new RegExp(`${method}:\\s*function`))
    }
  })

  test('the lynx frame event names match between the facade and the main thread', () => {
    for (const name of ['SongloftLynxFrame.message', 'SongloftLynxFrame.openFailed']) {
      expect(read('src/native/web-lynx-frame.ts'), `the facade does not declare ${name}`)
        .toContain(name)
      expect(read('web/lynx-frame-host.js'), `the main thread does not emit ${name}`)
        .toContain(name)
    }
  })

  /*
   * The dispose race (`removeChild` + an immediate recreate stacking a second
   * worker on one still going down) is gated BEHAVIOURALLY in
   * `web-plugin-frame-keepalive.test.ts`, which runs the host script and asserts no
   * child appears until the old one finished disposing. A text assertion was tried
   * here first and was worthless: renaming the function definition left the call
   * site matching, so the gate stayed green with the fix removed. Don't re-add one.
   */

  /**
   * The host must never detach a plugin frame. `remove()` / `removeChild` in
   * `webview-host.js` is the exact line that crashed the renderer.
   */
  test('the Web iframe host never detaches a plugin frame', () => {
    const host = read('web/webview-host.js')
    expect(host, 'webview-host.js detaches a frame again').not.toMatch(/\.remove\(\)/)
    expect(host, 'webview-host.js detaches a frame again').not.toMatch(/removeChild\(/)
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
  // HarmonyOS was missing from this loop entirely, which is how `logWrite` /
  // `logRead` / `shareFile` shipped there as stubs (see `ClientFileLog.ets`'s
  // header): the module existed, the JS sink probe saw functions, and every log
  // line was silently dropped. It is a first-class host for this module, so it
  // is asserted like the other two.
  test.each(methods)('SongloftPlatform.%s', (method) => {
    expectLynxMethod(hosts.platform.android, method)
    expectSwiftMethod(hosts.platform.ios, method)
    expectArkTsMethod(hosts.platform.harmony, method)
  })
})

/**
 * The log-export fast path (`shareLogArchive`, songloft-player-lynx#3).
 *
 * Its entire reason to exist is *where the work happens*, and nothing about that
 * is visible to a typechecker or a unit test: a host that quietly went back to
 * accepting a base64 payload, or read the client log into a string, or zipped on
 * the UI thread, would still satisfy every other gate in this file — and would
 * put the multi-second pause back in front of the share sheet, on a device, with
 * no failing test anywhere.
 *
 * So each assertion below names a specific way the win can be lost.
 */
describe('shareLogArchive keeps the bytes out of JS', () => {
  const androidLog = read(`${ANDROID_PLATFORM}/ClientFileLog.kt`)
  const harmonyLog = read(`${HARMONY_MODULES}/platform/ClientFileLog.ets`)

  test('no host base64-encodes anything for the archive', () => {
    // Exactly one decode site each: the legacy `shareFile`, which Web and older
    // shells still use. A second one means the fast path grew a base64 payload —
    // i.e. the ~40 MB bridge string this replaced.
    expect(
      hosts.platform.android.split('Base64.decode').length - 1,
      'Base64.decode belongs only in shareFile',
    ).toBe(1)
    expect(
      hosts.platform.ios.split('Data(base64Encoded:').length - 1,
      'base64 decoding belongs only in shareFile',
    ).toBe(1)
    expect(
      hosts.platform.harmony.split('decodeSync(').length - 1,
      'base64 decoding belongs only in shareFile',
    ).toBe(1)
  })

  test('each host zips natively instead of accepting a JS-built archive', () => {
    expect(hosts.platform.android, 'Android must build the zip itself').toContain(
      'ZipOutputStream(',
    )
    expect(hosts.platform.android).toContain('putNextEntry(')
    // Apple has no zip-entry API; `.forUploading` is the coordinated-read that
    // produces one, and it avoids a hand-rolled archive format.
    expect(hosts.platform.ios, 'iOS must zip via NSFileCoordinator').toContain('.forUploading')
    expect(hosts.platform.harmony, 'HarmonyOS must zip via zlib').toContain('zlib.compressFile(')
  })

  test('the client log is copied on the log thread, never read into a string', () => {
    // `logRead` hands the whole (≤20 MB) file to JS as one bridge string. The
    // archive path must use the file copy instead — and it must be the log
    // thread's copy, so lines queued while reproducing the bug are already on
    // disk.
    expect(androidLog, 'Android ClientFileLog needs copyTo').toMatch(/fun copyTo\(/)
    expect(androidLog, 'copyTo must run on the log executor').toMatch(
      /fun copyTo\([\s\S]{0,400}?executor\.execute/,
    )
    expect(hosts.platform.ios, 'iOS ClientFileLog needs copyTo').toMatch(/static func copyTo\(/)
    expect(hosts.platform.ios, 'copyTo must run on the log queue').toMatch(
      /static func copyTo\([\s\S]{0,200}?queue\.async/,
    )
    expect(harmonyLog, 'HarmonyOS ClientFileLog needs copyTo').toMatch(/static copyTo\(/)

    for (const [platform, source] of [
      ['Android', hosts.platform.android],
      ['iOS', hosts.platform.ios],
      ['HarmonyOS', hosts.platform.harmony],
    ] as const) {
      expect(source, `${platform} must call ClientFileLog.copyTo`).toContain(
        'ClientFileLog.copyTo',
      )
    }
  })

  test('the backend log is streamed to disk, not buffered as a string', () => {
    // Kotlin's `bufferedReader().readText()` is fine for an error body but would
    // hold the whole 10 MiB log; the success path must copy the stream.
    expect(hosts.platform.android).toMatch(
      /conn\.inputStream\.use \{ input[\s\S]{0,160}?copyTo\(output\)/,
    )
    // `downloadTask` streams to a temp file; `dataTask` would hand back a Data.
    expect(hosts.platform.ios, 'iOS must use downloadTask for the backend log').toContain(
      'downloadTask(with: request)',
    )
  })

  test('the backend download honours the insecure-TLS switch on every host', () => {
    // A self-signed LAN server is the common setup, and an export has to work
    // exactly when things are broken.
    expect(hosts.platform.android).toContain('InsecureTls.configure(conn)')
    expect(hosts.platform.ios).toContain('InsecureTls.shared.session.downloadTask')
    expect(hosts.platform.harmony).toContain('InsecureTls.isEnabled()')
  })

  test('staging is wiped before each run', () => {
    // A leftover directory from an interrupted export would ship stale logs
    // inside the new archive — silently, and to whoever the user sends it to.
    expect(hosts.platform.android).toContain('staging.deleteRecursively()')
    expect(hosts.platform.ios).toMatch(/try\? fm\.removeItem\(at: container\)/)
    expect(hosts.platform.harmony).toContain('removeDir(container)')
  })

  test('the result payload keys match the TS parser verbatim', () => {
    // Three hand-written JSON literals against one hand-written parser, matched
    // by identity at runtime and by nothing at build time. A typo degrades the
    // success toast to "backend logs unavailable" on a successful export.
    const facade = read('src/native/native-platform.ts')
    for (const key of ['hasBackend', 'hasFrontend']) {
      expect(facade, `the TS facade does not read ${key}`).toContain(`parsed.${key} === true`)
      expect(hosts.platform.android, `Android does not emit ${key}`).toContain(`\\"${key}\\"`)
      expect(hosts.platform.ios, `iOS does not emit ${key}`).toContain(`\\"${key}\\"`)
      expect(hosts.platform.harmony, `HarmonyOS does not emit ${key}`).toContain(`"${key}":`)
    }
  })

  test('no host can report a blank error, which reads as success', () => {
    // The facade rejects on `error != null`, but a blank message would still
    // produce an empty-looking failure toast — and the hosts build this argument
    // from a caught exception, whose message is allowed to be blank. Each one
    // needs a fallback that a null-check alone does not give.
    expect(hosts.platform.android, 'Kotlin needs a blank-safe reason()').toMatch(
      /fun reason\(e: Throwable[\s\S]{0,200}?isNotBlank\(\)/,
    )
    expect(hosts.platform.harmony, 'ArkTS needs a blank-safe errorText()').toMatch(
      /static errorText\(err: Error\)[\s\S]{0,200}?length > 0/,
    )
    // iOS only ever passes fixed literals or `localizedDescription`, which is
    // documented non-empty — no helper needed, but the literals must be there.
    expect(hosts.platform.ios).toContain('"zip_failed"')
    expect(hosts.platform.ios).toContain('"staging_failed"')
  })

  test('iOS copies the coordinator zip instead of moving it', () => {
    // The coordinator owns that temp file and cleans it up itself; moving it out
    // from under it is a bet on an undocumented detail.
    expect(hosts.platform.ios).toMatch(/copyItem\(at: zipped, to: dest\)/)
    expect(hosts.platform.ios, 'do not move the coordinator temp file').not.toMatch(
      /moveItem\(at: zipped/,
    )
  })

  test('an empty archive fails with the same message on every path', () => {
    // The toast is `settings.exportLogsFailed` with the raw message in it, so a
    // host wording of its own would read as a different bug.
    const sentinel = 'no logs to export'
    expect(read('src/features/settings/data/log-export.ts')).toContain(sentinel)
    expect(hosts.platform.android).toContain(sentinel)
    expect(hosts.platform.ios).toContain(sentinel)
    expect(hosts.platform.harmony).toContain(sentinel)
  })
})

describe('SongloftDlna module methods and state exist on every supported host', () => {
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
    expectArkTsMethod(hosts.dlna.harmony, method)
  })

  test('HarmonyOS persists discovery results for getDevices', () => {
    expect(hosts.dlna.harmony).toMatch(/private devices:\s*DlnaDevice\[\]\s*=\s*\[\]/)
    expect(hosts.dlna.harmony).toMatch(
      /public getDevices[\s\S]*?callback\(JSON\.stringify\(this\.devices\)\)/,
    )
    expect(hosts.dlna.harmony).not.toContain('JSON.stringify({ devices: [] })')
  })

  test('HarmonyOS resolves a device id to its AVTransport control URL', () => {
    expect(hosts.dlna.harmony).toContain('controlUrl: string')
    expect(hosts.dlna.harmony).toContain('this.findDevice(deviceId)')
    expect(hosts.dlna.harmony).toContain('this.soapAction(device.controlUrl')
  })
})

describe('SongloftFloatingLyric module methods exist on Android', () => {
  // The TS interface is in floating-lyric.ts (Promise-shaped, no native interface).
  const methods = ['hasPermission', 'requestPermission', 'show', 'updateLyric', 'hide', 'isShowing', 'setFontSize', 'setLocked', 'setOpacity', 'setTwoLine']

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
 * The overlay grant is **asynchronous and result-less**: `ACTION_MANAGE_OVERLAY_PERMISSION`
 * cannot be started for result, so the only observable moment is the app coming
 * back to the foreground. The first implementation answered `false` immediately
 * after `startActivity` — i.e. "denied" for every grant the user was about to
 * make — so the settings switch stayed on with no overlay behind it and only a
 * second off/on round-trip ever showed the lyrics (real-device report).
 *
 * Nothing else in the repo can see this: every call on the path resolves fine,
 * and a rendering test has no system screen to come back from. So the shape is
 * gated on the sources.
 */
describe('the overlay grant is answered after the return trip, not before it', () => {
  const module = hosts.floatingLyric.android
  const gate = read(`${ANDROID_LYRIC}/OverlayPermission.kt`)
  const activity = read('android/app/src/main/java/org/songloft/lynx/MainActivity.kt')

  test('requestPermission hands the wait to OverlayPermission', () => {
    expect(
      module,
      'requestPermission must delegate to OverlayPermission.request — inline handling ' +
        'cannot wait for the user to come back',
    ).toMatch(/OverlayPermission\.request\(/)
    expect(
      module,
      'the module must not open the system screen itself: that is the shape that ' +
        'answered `false` in the same breath',
    ).not.toMatch(/ACTION_MANAGE_OVERLAY_PERMISSION/)
  })

  test('MainActivity.onResume is what answers a pending request', () => {
    expect(
      activity,
      'without this wire a parked grant request is never answered and the overlay ' +
        'never appears after the first grant',
    ).toMatch(/override fun onResume\(\)[\s\S]{0,240}OverlayPermission\.onAppForegrounded\(/)
  })

  test('a request that cannot open the system screen is answered instead of parked', () => {
    // A waiter nobody resumes leaves the JS promise pending forever, and with it
    // whatever the caller was going to do about the switch.
    expect(gate).toMatch(/catch[\s\S]{0,80}answer\(false\)/)
  })

  test('waiters are drained, so each bridge Callback is invoked exactly once', () => {
    // Invoking a Lynx Callback twice throws; the re-check runs several times.
    expect(gate).toMatch(/waiters\.clear\(\)/)
  })

  test('hasPermission exists as the silent read used by startup / page entry', () => {
    expect(gate).toMatch(/fun isGranted\(/)
    // Comments stripped: the startup file *explains* why it avoids the call, and
    // the prose would otherwise satisfy the match it is warning about.
    const startup = read('src/index.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(
      startup,
      'startup must not call requestPermission: it opens a system screen and only ' +
        'answers once the app is foregrounded again, stalling the startup chain',
    ).not.toMatch(/requestPermission/)
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
    expect(methods).toEqual([
      'open', 'close', 'isOpen',
      'setSurfaceLayout', 'setOrientation', 'getVideoSize',
    ])
  })

  test.each(methods)('SongloftVideoModule.%s has @LynxMethod and uses Callback', (method) => {
    expectLynxMethod(hosts.video.android, method)
    expect(
      hosts.video.android,
      `SongloftVideoModule.${method} must take a Callback, not a Kotlin lambda`,
    ).toMatch(new RegExp(`fun ${method}\\([^)]*callback:\\s*Callback`))
  })

  test('Android does not push a closed event; the host draws pixels only, JS owns the controls', () => {
    // The framework back key already routes to the same `performRouteBack` the
    // page uses on its own, so a second close-from-host channel would just be a
    // second source of truth for the same signal. The fullscreen shows a bare
    // surface under the Lynx view: no native close button, JS is the only
    // control layer (one style on every platform).
    expect(hosts.video.android).not.toContain('"SongloftVideo.closed"')
    expect(hosts.video.android).not.toContain('buildCloseButton')
    expect(hosts.video.androidMain).toContain('setZOrderMediaOverlay(true)')
    expect(hosts.video.androidMain).toContain('addView(')
  })

  test('the host emits videoSizeChanged and orientationChanged', () => {
    // These are the only two channels a JS page can use to learn about the
    // decoder's aspect ratio and the window's real orientation. Without both,
    // a rotated device would still paint a stretched picture (the fix this
    // whole feature exists for).
    expect(hosts.video.android).toContain('SongloftVideo.videoSizeChanged')
    expect(hosts.video.android).toContain('SongloftVideo.orientationChanged')
    // The module owns the constant; MainActivity posts to it by name.
    expect(hosts.video.androidMain).toContain('EVENT_ORIENTATION_CHANGED')
  })

  test('MainActivity gives the module a handle to the Activity and an event emitter', () => {
    // The module cannot lock orientation without an Activity, and cannot push
    // events without a way into the LynxView. Both wires are cheap to forget
    // (nothing on the JS side notices) so pin them here.
    expect(hosts.video.androidMain).toContain('setActivity(this)')
    expect(hosts.video.androidMain).toContain('setEventEmitter')
  })

  test('the engine can lend out a surface, and the module hands it back', () => {
    expect(
      hosts.audio.android,
      'engine exposes no attachVideoOutput — the video screen would open onto nothing',
    ).toContain('fun attachVideoOutput')
    expect(hosts.audio.android).toContain('fun detachVideoOutput')
    expect(
      hosts.video.android,
      'the module never detaches: ExoPlayer would keep drawing into a hidden surface',
    ).toContain('detachVideoOutput')
  })

  test('the module touches the player only on the main thread', () => {
    // A `@LynxMethod` arrives on the BTS thread and ExoPlayer is main-thread-only.
    // Batch 48 shipped the same mistake in FloatingLyricService, where the resulting
    // CalledFromWrongThreadException was swallowed by a bare catch.
    expect(hosts.video.android).toContain('runOnMain')
  })

  test('the host tells "no video track" apart from "stream failed to load"', () => {
    // `songs.is_video` comes from the original file at scan time; a remote song may be
    // served from a cache entry transcoded with `-vn` (genuinely no track), or the
    // transcode itself may have failed (the item errors, which `hasVideoTrack()` alone
    // reads as "no track"). The engine must distinguish the two and the module must
    // forward both reason strings.
    expect(hosts.audio.android).toContain('fun videoTrackState')
    expect(hosts.audio.android).toContain('fun hasVideoTrack')
    expect(hosts.audio.android, 'a failed stream must be caught before the track check').toContain(
      'playerError',
    )
    expect(hosts.video.android).toContain('videoTrackState')
    expect(hosts.video.android).toContain('"noTrack"')
    expect(hosts.video.android).toContain('"failed"')
  })
})

describe('SongloftVideo module surface (iOS)', () => {
  // The full set from `interfaceMethods(video.ts)` — commit 2 migrated the module
  // from AVPlayerViewController-modal to AVPlayerLayer-under-LynxView, so the JS
  // surface is the same as Android's.
  const methods = interfaceMethods(read('src/native/video.ts'), 'NativeVideoModule')

  test.each(methods)('SongloftVideoModule.%s exists in Swift with methodLookup', (method) => {
    expectSwiftMethod(hosts.video.ios, method)
  })

  test('the dead AVPlayerViewController surface is gone', () => {
    // AVPlayerViewController put its own Done button in the modal chrome; the
    // JS page owns every control now, so any leftover reference to the
    // controller / its dismissal callbacks means we forgot to migrate a path.
    expect(hosts.video.ios).not.toContain('AVPlayerViewController')
    expect(hosts.video.ios).not.toContain('SongloftVideoViewController')
    expect(hosts.video.ios).not.toContain('SongloftVideo.closed')
    expect(hosts.video.ios).not.toContain('presentedVC')
  })

  test('the picture is painted by an AVPlayerLayer hosted under the LynxView', () => {
    // Android's `SurfaceView + setZOrderMediaOverlay(true)` counterpart: the
    // module must render on its own AVPlayerLayer sitting on a host UIView, so
    // the JS page paints every control above it. `resizeAspect` at layer level
    // would ignore the JS-driven fit/zoom rect — `resize` is what makes
    // `setSurfaceLayout` the single control point for sizing.
    expect(hosts.video.ios).toContain('AVPlayerLayer')
    expect(hosts.video.ios).toContain('videoGravity = .resize')
    expect(hosts.video.ios).toContain('setHostView')
  })

  test('the engine can lend out the player, and the module hands it back', () => {
    expect(
      hosts.audio.ios,
      'engine exposes no attachVideoOutput — the video screen would open onto nothing',
    ).toContain('func attachVideoOutput')
    expect(hosts.audio.ios).toContain('func detachVideoOutput')
    expect(
      hosts.video.ios,
      'the video module never detaches: AVPlayer would keep feeding a torn-down layer',
    ).toContain('detachVideoOutput')
  })

  test('the host emits videoSizeChanged and orientationChanged', () => {
    // Same events, byte-for-byte, as Android — the JS facade decodes both from
    // the same listener. `orientationChanged` is pushed from viewWillTransition
    // in ViewController, not from the module itself.
    expect(hosts.video.ios).toContain('SongloftVideo.videoSizeChanged')
    expect(hosts.video.ios).toContain('SongloftVideo.orientationChanged')
    expect(hosts.iosViewController).toContain('emitOrientation')
    expect(hosts.iosViewController).toContain('viewWillTransition')
  })

  test('ViewController wires the module up (host view + controller + emitter)', () => {
    // Without setHostView the picture opens onto nothing; without
    // setHostController the orientation lock cannot ask UIKit to recompute the
    // supported set.
    expect(hosts.iosViewController).toContain('SongloftVideoModule.setHostView')
    expect(hosts.iosViewController).toContain('SongloftVideoModule.setHostController')
    expect(hosts.iosViewController).toContain('supportedInterfaceOrientations')
  })

  test('the engine observes presentationSize so the picture can be laid out', () => {
    // AVPlayerItem.presentationSize is what carries the *decoded* picture size —
    // rotated / anamorphic content only lands right through this KVO. `naturalSize`
    // (raw track dimensions) is not equivalent.
    expect(hosts.audio.ios).toContain('presentationSize')
    expect(hosts.audio.ios).toContain('func currentVideoSize')
  })

  test('the host tells "no video track" apart from "stream failed to load"', () => {
    // `hasVideoTrack()` returns false both for a genuinely pictureless stream and for
    // an item that failed (`.failed` status) — which would mask a refused transcode as
    // "this file has no video track". The engine must read the item status first and
    // the module must forward both reason strings.
    expect(hosts.audio.ios).toContain('func videoTrackState')
    expect(hosts.audio.ios).toContain('func hasVideoTrack')
    expect(hosts.video.ios).toContain('videoTrackState')
    expect(hosts.video.ios).toContain('"noTrack"')
    expect(hosts.video.ios).toContain('"failed"')
  })
})

describe('SongloftVideo module surface (HarmonyOS)', () => {
  const methods = interfaceMethods(read('src/native/video.ts'), 'NativeVideoModule')

  test.each(methods)('SongloftVideoModule.%s exists as a public ArkTS method', (method) => {
    expectArkTsMethod(hosts.video.harmony, method)
  })

  test('the dead closed event is gone; the host draws pixels only, JS owns the controls', () => {
    // The system back gesture routes to `performRouteBack` via
    // SongloftNavigationModule.handleBackPress, so a second close-from-host
    // channel would just be a second source of truth for the same signal.
    expect(hosts.video.harmony).not.toContain("'SongloftVideo.closed'")
    expect(hosts.video.harmony).not.toContain('"SongloftVideo.closed"')
  })

  test('the picture is painted by an XComponent hosted under the LynxView', () => {
    // Same z-order as Android (SurfaceView + `setZOrderMediaOverlay(true)`)
    // and iOS (AVPlayerLayer on a host UIView): the XComponent goes first in
    // the Stack, so the LynxView paints every control on top of it.
    expect(hosts.harmonyIndex).toContain('XComponent')
    expect(hosts.harmonyIndex).toContain('XComponentType.SURFACE')
    // Order matters: XComponent must appear before LynxView in the Stack body.
    const xcAt = hosts.harmonyIndex.indexOf('XComponent(')
    const lynxAt = hosts.harmonyIndex.indexOf('LynxView(')
    expect(xcAt, 'XComponent must appear before LynxView so the LynxView paints on top')
      .toBeLessThan(lynxAt)
    // `HitTestMode.None` lets `bindtap` on the page reach through to the JS
    // control layer instead of being swallowed by the XComponent.
    expect(hosts.harmonyIndex).toContain('HitTestMode.None')
  })

  test('the engine can lend out its surface, and the module hands it back', () => {
    expect(
      hosts.audio.harmony,
      'engine exposes no attachVideoOutput — the video screen would open onto nothing',
    ).toContain('attachVideoOutput')
    expect(hosts.audio.harmony).toContain('detachVideoOutput')
    expect(
      hosts.video.harmony,
      'the module never detaches: AVPlayer would keep drawing into a hidden surface',
    ).toContain('detachVideoOutput')
  })

  test('the host emits videoSizeChanged and orientationChanged', () => {
    // Same events, byte-for-byte, as Android/iOS — the JS facade decodes all
    // three hosts from the same listener. `orientationChanged` is pushed
    // from EntryAbility.observeWindowSize, not from the module itself.
    expect(hosts.video.harmony).toContain('SongloftVideo.videoSizeChanged')
    expect(hosts.video.harmony).toContain('SongloftVideo.orientationChanged')
    expect(hosts.harmonyEntry).toContain('emitOrientation')
    expect(hosts.harmonyEntry).toContain('windowSizeChange')
  })

  test('EntryAbility wires the module up (host window)', () => {
    // Without setHostWindow the orientation lock cannot ask the window to
    // rotate — same wire Android's setActivity provides and iOS's
    // setHostController provides.
    expect(hosts.harmonyEntry).toContain('SongloftVideoModule.setHostWindow')
  })

  test('the engine observes the decoded picture size', () => {
    // AVPlayer's `videoSizeChange` event carries the *decoded* picture size,
    // the counterpart of Android's `Player.Listener.onVideoSizeChanged` and
    // iOS's `AVPlayerItem.presentationSize` KVO.
    expect(hosts.audio.harmony).toContain("'videoSizeChange'")
    expect(hosts.audio.harmony).toContain('currentVideoSize')
  })

  test('the host tells "no video track" apart from "stream failed to load"', () => {
    // Same three-way (`hasTrack`/`noTrack`/`failed`) as Android/iOS. On
    // Harmony the engine drives it from a two-flag state machine
    // (itemReady/itemFailed) rather than a per-item status enum, because
    // AVPlayer does not expose one, but the three exposed values match.
    expect(hosts.audio.harmony).toContain('videoTrackState')
    expect(hosts.video.harmony).toContain('videoTrackState')
    expect(hosts.video.harmony).toContain('noTrack')
    expect(hosts.video.harmony).toContain('failed')
  })
})

/**
 * Web is a fourth host for `SongloftVideo`: `web/songloft-video-module.js` is the
 * worker-side factory the LynxView's `nativeModulesMap` points at, and
 * `web/audio-host.js` owns the main-thread `<video>` behind it.
 *
 * The whole facade rejects a **partial** module (`readNativeVideo` requires every
 * method on `NativeVideoModule`) — that is not a defence-in-depth wish, it is how
 * a stale worker shim used to reduce an entire feature to `open()` returning
 * `'failed'` while every other host worked. If you add a method to `video.ts`,
 * add it here **and** in `audio-host.js` in the same change.
 */
describe('SongloftVideo module surface (Web)', () => {
  const methods = interfaceMethods(read('src/native/video.ts'), 'NativeVideoModule')
  const workerModule = read('web/songloft-video-module.js')
  const mainHost = read('web/audio-host.js')

  test.each(methods)(
    'songloft-video-module.js exposes %s (partial module → null adapter → open() returns failed forever)',
    (method) => {
      // Grep is enough — the factory currently emits `open: forward(call,
      // 'open'),` for each method. A refactor that reintroduces per-method
      // stubs would still land the identifier, and a rename is exactly what
      // this gate catches.
      expect(
        workerModule,
        `songloft-video-module.js does not expose ${method}. `
        + `readNativeVideo() would return null, the video facade would use its `
        + `inert stub, and every open() call would resolve to 'failed'.`,
      ).toMatch(new RegExp(`${method}\\s*:`))
    },
  )

  test('the main-thread host implements every method the worker forwards to', () => {
    // The forward path is `worker → call(name, [json]) → onNativeModulesCall
    // dispatch → videoHandlers[name]`. A missing entry in videoHandlers means
    // the call returns undefined and the JS callback never fires — the facade
    // times out into the same generic failure mode.
    for (const method of methods) {
      expect(
        mainHost,
        `audio-host.js's videoHandlers is missing ${method}`,
      ).toMatch(new RegExp(`${method}\\s*:\\s*(function|openVideoStream)`))
    }
  })

  test('the host emits videoSizeChanged so the JS page can lay out its overlay', () => {
    // On Web the <video> element does letterbox itself (object-fit: contain),
    // but FullVideoPage still subscribes to the size event to keep the overlay
    // controls in sync. The <video>'s `loadedmetadata` is what carries the
    // decoded size, and `resize` catches a mid-play HLS variant change.
    expect(mainHost).toContain("'SongloftVideo.videoSizeChanged'")
    expect(mainHost).toContain("addEventListener('loadedmetadata', emitVideoSize)")
    expect(mainHost).toContain("addEventListener('resize', emitVideoSize)")
  })

  test('audio-host.js registers the worker module URL', () => {
    // The URL string must appear inside the nativeModulesMap literal, not just
    // anywhere in the file — the earlier version had every module *mentioned*
    // in a doc comment while none were actually registered.
    expect(mainHost).toMatch(/SongloftVideo:\s*'\/songloft-video-module\.js'/)
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
    { name: 'SongloftPluginBridge', android: 'SongloftPluginBridgeModule', ios: 'SongloftPluginBridgeModule', harmony: 'SongloftPluginBridgeModule' },
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
  test('Android sends with the deadline-aware client and filtered headers; iOS consumes the same control header', () => {
    const android = read('android/app/src/main/java/org/songloft/lynx/net/SongloftHttpService.kt')
    const helper = read('android/app/src/main/java/org/songloft/lynx/net/RequestTimeout.kt')
    expect(helper).toContain(`name.equals("${REQUEST_TIMEOUT_HEADER}", ignoreCase = true)`)
    const client = android.match(/val (\w+) = clientWithRequestTimeout\(clientFor\(InsecureTls.enabled\), (\w+)\)/)
    expect(client).not.toBeNull()
    expect(android).toContain(`.headers(${client![2]}.toHeaders())`)
    expect(android).toContain(`${client![1]}.newCall(okRequest)`)

    const ios = read(`${IOS_DIR}/SongloftHttpService.swift`)
    const guard = ios.match(/if key\.caseInsensitiveCompare\("([^"]+)"\)[\s\S]*?continue/)
    expect(guard?.[1]).toBe(REQUEST_TIMEOUT_HEADER)
    expect(guard?.[0]).toContain('nsRequest.timeoutInterval = Double(timeoutMs) / 1000')
    expect(ios.indexOf(guard![0])).toBeLessThan(ios.indexOf('nsRequest.setValue(value, forHTTPHeaderField: key)'))
  })

  test('plugin uploads allow four minutes on every native host without changing the method signature', () => {
    expect(hosts.platform.android).toMatch(/if \(URL\(uploadUrl\)\.path\.endsWith\("\/api\/v1\/jsplugins\/upload"\)\) \{\s*conn\.connectTimeout = 15_000\s*conn\.readTimeout = 240_000/)
    expect(hosts.platform.ios).toMatch(/if url\.path\.hasSuffix\("\/api\/v1\/jsplugins\/upload"\) \{\s*request\.timeoutInterval = 240/)
    expect(hosts.platform.harmony).toMatch(/readTimeout: uploadUrl\.split\('\?'\)\[0\]\.endsWith\('\/api\/v1\/jsplugins\/upload'\) \? 240000 : 60000/)
  })

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

  // `ohos.permission.MULTICAST` is NOT defined in the HarmonyOS SDK — declaring
  // it broke the local build and was removed (e6c7bc9). This guard keeps the
  // removed permission from being "restored" by whoever reads the old intent.
  test('MULTICAST permission is NOT declared (undefined in the SDK, build blocker)', () => {
    expect(permissions).not.toContain('ohos.permission.MULTICAST')
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
