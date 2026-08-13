/**
 * Platform capability detection.
 *
 * Provides a unified view of what features are available on the current
 * platform (native, Web, or test). The native modules graceful-degradation
 * stubs already handle missing features at runtime, but for the Web platform
 * we also want to **hide** UI entries that will never work (e.g. floating
 * lyrics, Live Activity, DLNA).
 */

import { readNativeModules } from './native-modules.js'
import { isWebEnvironment } from './web-platform.js'

export interface PlatformCapabilities {
  /** User-facing floating lyrics overlay (Android overlay / iOS Live Activity). */
  floatingLyric: boolean
  /** iOS Dynamic Island / Lock Screen live activity. */
  liveActivity: boolean
  /** DLNA/UPnP media casting. */
  dlna: boolean
  /** Native file picker (Web fallback uses `<input type="file">`). */
  nativeFilePicker: boolean
  /** Bundle mode (Go backend embedded in the client). */
  bundleMode: boolean
  /** Data export/import via file transfer. */
  dataTransfer: boolean
  /** System tray / minimize-to-tray (desktop only). */
  systemTray: boolean
}

/**
 * Detect whether a native module with the given name exists.
 */
function hasNativeModule(name: string): boolean {
  const mods = readNativeModules()
  return mods != null && name in mods
}

/**
 * Return the capabilities for the current platform.
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  const isWeb = isWebEnvironment()
  const hasNative = hasNativeModule('SongloftPlatform')

  return {
    // Floating lyrics requires an Android overlay or iOS activity — not possible on Web.
    floatingLyric: hasNative && hasNativeModule('SongloftFloatingLyric'),

    // Live Activity is iOS-only.
    liveActivity: hasNative && hasNativeModule('SongloftLiveActivity'),

    // DLNA requires native discovery & casting.
    dlna: hasNative && hasNativeModule('SongloftDlna'),

    // Web has a file picker via `<input type="file">`, but it's not "native".
    nativeFilePicker: hasNative,

    // Bundle mode is not available on Web.
    bundleMode: hasNative,

    // Data transfer: Web can use download/upload, native has file picker.
    dataTransfer: true,

    // System tray is desktop-only (Lynxtron).
    systemTray: hasNative,
  }
}