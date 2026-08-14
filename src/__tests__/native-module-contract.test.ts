import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  GLOBAL_PROP_LOCALE,
  GLOBAL_PROP_THEME,
  SYSTEM_APPEARANCE_EVENT,
} from '../native/system-appearance.js'
import { NATIVE_EVENT } from '../native/native-audio.js'

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
const IOS_DIR = 'ios/SongloftLynx'

/** Both hosts' sources concatenated, per subsystem. */
const hosts = {
  audio: {
    android: read(`${ANDROID_AUDIO}/SongloftAudioEngine.kt`),
    ios: read(`${IOS_DIR}/SongloftAudioEngine.swift`),
  },
  audioModule: {
    android: read(`${ANDROID_AUDIO}/SongloftAudioModule.kt`),
    ios: read(`${IOS_DIR}/SongloftAudioModule.swift`),
  },
  storage: {
    android: read(`${ANDROID_STORAGE}/SongloftStorageModule.kt`),
    ios: read(`${IOS_DIR}/SongloftStorageModule.swift`),
  },
  system: {
    // The Android half is split: constants in SystemAppearance.kt, the two
    // delivery channels in MainActivity; iOS keeps both in the view controller.
    android:
      read(`${ANDROID_SYSTEM}/SystemAppearance.kt`) +
      read('android/app/src/main/java/org/songloft/lynx/MainActivity.kt'),
    ios: read(`${IOS_DIR}/SystemAppearance.swift`) + read(`${IOS_DIR}/ViewController.swift`),
  },
}

/** Method names declared on a TS native-module interface, in source order. */
function interfaceMethods(source: string, interfaceName: string): string[] {
  const start = source.indexOf(`export interface ${interfaceName} {`)
  expect(start, `interface ${interfaceName} not found`).toBeGreaterThan(-1)
  const body = source.slice(start, source.indexOf('\n}', start))
  return [...body.matchAll(/^\s{2}(?:\/\*\*.*)?(\w+)\??\(/gm)].map((m) => m[1] as string)
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
    expect(hosts.audioModule.android, `Kotlin has no @LynxMethod ${method}`).toContain(
      `fun ${method}(`,
    )
    // iOS needs both halves: the Swift method *and* its `methodLookup` entry —
    // a method without a lookup entry does not exist as far as JS is concerned.
    expect(hosts.audioModule.ios, `Swift has no func ${method}`).toContain(`func ${method}(`)
    expect(hosts.audioModule.ios, `methodLookup is missing "${method}"`).toContain(`"${method}":`)
  })

  test.each(storageMethods)('SongloftStorage.%s', (method) => {
    expect(hosts.storage.android, `Kotlin has no @LynxMethod ${method}`).toContain(
      `fun ${method}(`,
    )
    expect(hosts.storage.ios, `Swift has no func ${method}`).toContain(`func ${method}(`)
    expect(hosts.storage.ios, `methodLookup is missing "${method}"`).toContain(`"${method}":`)
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
