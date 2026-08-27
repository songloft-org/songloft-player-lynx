/**
 * Which platform the app is running on, as the *capability* question the network
 * layer asks: "what containers must the server transcode for this client?"
 *
 * Kept apart from {@link isWebPlatform} on purpose — the two answer different
 * questions and **must not be implemented in terms of each other**:
 *
 * | | question | answer with no host (tests, plain node) |
 * |---|---|---|
 * | `isWebPlatform()` | should this render the Web branch? | `false` |
 * | `getPlatformTarget()` | which format set may I assume? | `'web'` |
 *
 * The fallbacks differ because the safe answer differs. Rendering-wise, "not Web"
 * keeps `<refresh>`/`<webview>` in the tree, which is right on a device and is what
 * every existing test expects. Format-wise, `'web'` is the most restrictive set, so
 * an unknown host gets a container it can certainly play. Wiring one to the other
 * would flip a batch of render decisions the moment this file changed.
 *
 * Measured host values (2026-08-16, iPhone 16 Pro / iOS 18.3 and an Android 13
 * emulator, read through the TestBridge): `SystemInfo.platform` is exactly
 * `'Android'` and `'iOS'` — capitalised, hence the `toLowerCase()`. Unlike
 * `NativeModules`, `SystemInfo` *is* reachable from the eval scope, which is how
 * those two values were confirmed rather than guessed.
 */

import type { AudioPlatform } from '../core/network/audio-format.js'
import { readSystemInfo } from './native-modules.js'

/**
 * The current platform, or `'web'` when the host does not say.
 *
 * Returns the `AudioPlatform` subset the hosts can actually be — `'native'` is a
 * libmpv-class target from the Flutter port and no Lynx host reports it.
 */
export function getPlatformTarget(): Exclude<AudioPlatform, 'native'> {
  const raw = readSystemInfo()?.['platform']
  if (typeof raw !== 'string') return 'web'
  const platform = raw.toLowerCase()
  if (platform === 'android') return 'android'
  // 'iOS' today; tolerate the older UIKit spellings rather than silently falling
  // back to 'web' (which would ask the server to transcode everything).
  if (platform === 'ios' || platform === 'ipados' || platform.startsWith('iphone')) return 'ios'
  if (platform === 'harmony') return 'harmony'
  return 'web'
}
