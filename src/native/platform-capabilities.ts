/**
 * What the current platform can actually do.
 *
 * The native bindings all degrade gracefully — a missing module becomes an inert
 * stub rather than a crash — but a *silent* no-op is its own bug: on Web the cast
 * screen scanned forever, the floating-lyrics switch did nothing when tapped, and
 * "export data" was a dead button. Entries that can never work here should not be
 * offered at all.
 *
 * ⚠️ This module was written for exactly that purpose and then **never wired to
 * anything** — it had no callers, and computed an `isWeb` it never used
 * (`tsconfig` has no `noUnusedLocals`, so nothing complained). If you add a
 * capability here, add its consumer in the same change.
 */

import { readNativeModules } from './native-modules.js'
import { isWebPlatform } from './web-platform.js'

export interface PlatformCapabilities {
  /** User-facing floating lyrics overlay (Android overlay window). */
  floatingLyric: boolean
  /** iOS Dynamic Island / Lock Screen live activity. */
  liveActivity: boolean
  /** DLNA/UPnP media casting. */
  dlna: boolean
  /** Native file picker (Web has `<input type="file">`, but not from this realm). */
  nativeFilePicker: boolean
  /** Bundle mode (Go backend embedded in the client). */
  bundleMode: boolean
  /** Data export/import via file transfer. */
  dataTransfer: boolean
  /** System tray / minimize-to-tray (desktop only). */
  systemTray: boolean
}

/** True when a native module of this name is present in the host bag. */
function hasNativeModule(name: string): boolean {
  const mods = readNativeModules()
  return mods != null && name in mods
}

/**
 * Capabilities of the current platform.
 *
 * Each feature keys off **its own** module rather than a blanket "is any native
 * module present" flag, because they genuinely diverge: as of the 2026-08-14
 * audit `SongloftFloatingLyric` is not registered on Android and
 * `SongloftLiveActivity` is not a Lynx module on iOS, so both correctly report
 * `false` here even on a device.
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  const isWeb = isWebPlatform()
  const hasPlatform = hasNativeModule('SongloftPlatform')

  return {
    floatingLyric: hasNativeModule('SongloftFloatingLyric'),
    liveActivity: hasNativeModule('SongloftLiveActivity'),
    dlna: hasNativeModule('SongloftDlna'),
    nativeFilePicker: hasPlatform,
    bundleMode: hasPlatform,
    // `openURL` / `pickAndUploadFile` need main-thread APIs (`window.open`,
    // `document.createElement`) that the render realm does not have, so on Web
    // both directions are dead until a host bridge exists (fix plan P2-2).
    dataTransfer: isWeb ? false : hasPlatform,
    systemTray: !isWeb && hasPlatform,
  }
}
