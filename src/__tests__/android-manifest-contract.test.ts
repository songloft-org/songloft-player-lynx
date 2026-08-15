import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Gates for `AndroidManifest.xml` — until now the **only** native contract
 * surface with no gate at all, and the one that let a whole feature ship dead.
 *
 * The manifest is where Android's half of the contract lives, and nothing in the
 * build checks that it agrees with the code: an undeclared component compiles,
 * links, installs and starts. `Context.startService()` on a class the manifest
 * never declared does not throw — the system logs one
 * `Unable to start service … not found` line and the call returns normally. A
 * missing `<uses-permission>` is quieter still: the app simply never appears in
 * the settings screen that would grant it.
 *
 * Both of those were true of the floating-lyrics overlay for four batches.
 * Batch 43 fixed the other four causes of its "five-fold death" and recorded
 * that the permission and the service declaration "were already there" — they
 * were not, in either the source manifest or the merged one. Nothing contradicted
 * that claim because nothing read the file.
 *
 * So these gates derive what the manifest **must** say from the Kotlin sources
 * rather than pinning a hand-written list: a new Service that nobody declares
 * fails here, without anyone having to remember to extend this file.
 */

const repoRoot = path.resolve(__dirname, '../..')
const ANDROID_MAIN = 'android/app/src/main'
const KOTLIN_ROOT = `${ANDROID_MAIN}/java`

const read = (relative: string): string =>
  readFileSync(path.join(repoRoot, relative), 'utf8')

const manifest = read(`${ANDROID_MAIN}/AndroidManifest.xml`)

/**
 * The namespace relative `android:name=".foo.Bar"` values resolve against. Read
 * from Gradle instead of hardcoded, so renaming it cannot silently turn every
 * derivation below into a comparison of two things that no longer meet.
 */
const namespace = (() => {
  const match = /namespace\s*=\s*"([^"]+)"/.exec(read('android/app/build.gradle.kts'))
  expect(match?.[1], 'no namespace in android/app/build.gradle.kts').toBeTruthy()
  return match![1] as string
})()

function kotlinFiles(dir: string): string[] {
  return readdirSync(path.join(repoRoot, dir)).flatMap((entry) => {
    const relative = `${dir}/${entry}`
    if (statSync(path.join(repoRoot, relative)).isDirectory()) return kotlinFiles(relative)
    return entry.endsWith('.kt') ? [relative] : []
  })
}

const kotlinSources = kotlinFiles(KOTLIN_ROOT).map((relative) => ({
  relative,
  source: read(relative),
}))

/** Every Kotlin source concatenated — for "is this API used anywhere" questions. */
const allKotlin = kotlinSources.map((f) => f.source).join('\n')

/**
 * Fully-qualified names of the Android components the code defines.
 *
 * A component is recognised by its **base class name** ending in `Service` or
 * `Activity` (`Service()`, `MediaSessionService()`, `Activity()`), which is what
 * actually decides whether the platform needs a manifest entry. Matching the
 * subclass name instead would miss a `class Overlay : Service()` and, worse, flag
 * plain classes that merely end in `Service` (`SongloftHttpService` is not a
 * component — it is a Lynx service object).
 */
const componentClasses = kotlinSources.flatMap(({ relative, source }) => {
  const pkg = /^package\s+([\w.]+)/m.exec(source)?.[1]
  return [...source.matchAll(/^(?:\w+\s+)*class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*(\w+)\(/gm)]
    .filter(([, , base]) => /(?:Service|Activity)$/.test(base as string))
    .map(([, name, base]) => ({
      fqn: `${pkg}.${name}`,
      base: base as string,
      relative,
    }))
})

/**
 * Components the manifest declares, as fully-qualified names.
 *
 * `[\s\S]*?>` stops at the end of the **opening** tag, so nested `<intent-filter>`
 * children (and their own `android:name`, which names an action rather than a
 * class) are never mistaken for the component's name.
 */
const declaredComponents = [...manifest.matchAll(/<(service|activity)\b([\s\S]*?)>/g)].map(
  ([, tag, attributes]) => {
    const name = /android:name="([^"]+)"/.exec(attributes as string)?.[1] ?? ''
    return {
      tag: tag as string,
      fqn: name.startsWith('.') ? `${namespace}${name}` : name,
    }
  },
)

const declaredPermissions = [
  ...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"/g),
].map(([, name]) => name as string)

describe('the manifest and the Kotlin components agree', () => {
  test('the sources were parsed (guard against a silent empty list)', () => {
    // Without this, an over-tightened regex above would turn every assertion in
    // this file into a comparison of two empty lists — green, and blind.
    expect(kotlinSources.length).toBeGreaterThan(5)
    expect(componentClasses.map((c) => c.fqn)).toContain(`${namespace}.MainActivity`)
    expect(declaredComponents.length).toBeGreaterThan(2)
  })

  test('every Service / Activity subclass is declared', () => {
    const missing = componentClasses
      .filter(({ fqn }) => !declaredComponents.some((d) => d.fqn === fqn))
      .map(({ fqn, base, relative }) => `${fqn} (: ${base}) defined in ${relative}`)
    expect(
      missing,
      'an undeclared component cannot be resolved at runtime, and startService() fails silently',
    ).toEqual([])
  })

  test('every declared component names a class that exists', () => {
    // The other direction: a rename or a typo leaves a declaration pointing at
    // nothing, which is the same silent failure seen from the other end.
    const dangling = declaredComponents
      .filter(({ fqn }) => !componentClasses.some((c) => c.fqn === fqn))
      .map(({ tag, fqn }) => `<${tag} android:name="${fqn}">`)
    expect(dangling, 'manifest declares a component with no Kotlin class').toEqual([])
  })
})

describe('permissions the code actually needs are declared', () => {
  /**
   * The defect this whole file exists for. `TYPE_APPLICATION_OVERLAY` /
   * `canDrawOverlays` are useless without the declaration: the app is absent from
   * "Display over other apps", so `canDrawOverlays()` can only return false and
   * the user cannot grant what was never requested.
   */
  test('drawing an overlay window implies SYSTEM_ALERT_WINDOW', () => {
    const usesOverlay =
      allKotlin.includes('TYPE_APPLICATION_OVERLAY') || allKotlin.includes('canDrawOverlays')
    expect(usesOverlay, 'nothing draws an overlay any more — drop this gate with the code').toBe(
      true,
    )
    expect(declaredPermissions).toContain('android.permission.SYSTEM_ALERT_WINDOW')
  })

  /**
   * Since Android 14 a `foregroundServiceType` without its matching permission
   * is a hard `SecurityException` at `startForeground()` — background playback
   * dies the moment the notification would appear.
   */
  test('each foregroundServiceType has its matching permission', () => {
    const types = [...manifest.matchAll(/android:foregroundServiceType="([^"]+)"/g)].flatMap(
      ([, value]) => (value as string).split('|'),
    )
    expect(types, 'no foreground service type declared any more').toContain('mediaPlayback')
    const required: Record<string, string> = {
      mediaPlayback: 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    }
    for (const type of types) {
      expect(declaredPermissions, `foregroundServiceType="${type}" needs its permission`).toContain(
        required[type] ?? `unmapped foregroundServiceType: ${type}`,
      )
    }
    expect(declaredPermissions).toContain('android.permission.FOREGROUND_SERVICE')
  })
})

/**
 * `AGENTS.md` §4 requires these three, and nothing checked them: without them
 * the Activity is **recreated** on a dark-mode or locale switch instead of
 * receiving the change, so the host's `sendGlobalEvent` channel never fires and
 * the page keeps rendering the old theme — the exact failure batch 21 shipped.
 */
test('MainActivity survives uiMode / locale / layoutDirection changes', () => {
  const activity = /<activity\b([\s\S]*?)>/.exec(manifest)?.[1] ?? ''
  expect(activity, 'first <activity> is expected to be MainActivity').toContain('.MainActivity')
  const configChanges = /android:configChanges="([^"]+)"/.exec(activity)?.[1] ?? ''
  for (const change of ['uiMode', 'locale', 'layoutDirection']) {
    expect(configChanges.split('|'), `configChanges must handle ${change}`).toContain(change)
  }
})

/**
 * Structural check, for the same reason the pbxproj and Info.plist have one:
 * every other assertion here is a substring or regex match, and none of them can
 * tell a well-formed manifest from one that merely contains the right
 * characters. A malformed manifest fails at merge time — late, and with an error
 * that points at a generated file rather than this one.
 */
test('the manifest is structurally well-formed', () => {
  const withoutComments = manifest.replace(/<!--[\s\S]*?-->/g, '')
  const stack: string[] = []
  const mismatches: string[] = []
  for (const [, closing, name, selfClosing] of withoutComments.matchAll(
    /<(\/?)([a-zA-Z][\w:.-]*)[^>]*?(\/?)>/g,
  )) {
    if (selfClosing === '/') continue
    if (closing === '/') {
      if (stack.pop() !== name) mismatches.push(`unexpected </${name}>`)
    } else {
      stack.push(name as string)
    }
  }
  expect(mismatches, 'malformed manifest markup').toEqual([])
  expect(stack, 'unclosed manifest tags').toEqual([])
})
