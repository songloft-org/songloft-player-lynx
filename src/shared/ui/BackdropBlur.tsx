import { useState } from '@lynx-js/react'
import { getPlatformTarget } from '../../native/platform-target.js'
import { BACKDROP_CAPTURE_TARGET } from '../../native/backdrop-capabilities.js'
import { useSurfaceAppearance } from '../theme/surface-appearance.js'

import './BackdropBlur.css'

let nextCaptureId = 0

/**
 * Gaussian radius shared by modal panels and menus. Floating capsules use
 * their own optical radius below, matching the Flutter capsule reference.
 *
 * `blur-radius` is a **string with a unit** (`BlurViewProps` documents the
 * default as `"0px"`), not a number — the Web implementation happens to be
 * lenient (it runs `parseFloat`), the native ones are not documented to be.
 */
export const BACKDROP_BLUR_RADIUS = '20px'
// Flutter's floating capsules use sigma 12 (shader blur 6). Keep the stronger
// content-panel blur separate from the compact optical material.
export const CAPSULE_BLUR_RADIUS = '12px'
export const CAPSULE_GLASS_RADIUS = '6px'

/** Themed fallback for iOS versions without Liquid Glass. */
export function blurEffectFor(
  platform: ReturnType<typeof getPlatformTarget>,
  theme: 'light' | 'dark',
): 'light' | 'dark' | 'glass' {
  return theme === 'dark' ? 'dark' : 'light'
}

export interface BackdropBlurProps {
  /** Android source must contain the page under this surface, excluding it. */
  captureTarget?: string
  /**
   * Extra class, for the **panel** mounting mode only — one of the
   * `.ui-backdrop-blur--*` modifiers in `BackdropBlur.css`. Scrim mode passes
   * nothing; the base class already covers its sibling's box exactly.
   */
  className?: string
}

/**
 * One decorative blur surface, never a glass-container. A container groups child
 * glass surfaces; these self-closing layers have no such children.
 *
 * Panel mode mounts first inside a fixed material shell, before its scrolling
 * content. Scrim mode mounts immediately before the tap-to-dismiss scrim. Keep
 * this a leaf so an unregistered blur element cannot hide interactive content.
 * Web's host aliases blur-view to web-core's implementation (web/index.html).
 * Native registration and OS support must be verified independently of JS.
 */
export function BackdropBlur({ className, captureTarget = BACKDROP_CAPTURE_TARGET }: BackdropBlurProps) {
  const platform = getPlatformTarget()
  const policy = useSurfaceAppearance()
  const [captureId] = useState(() => `songloft-capsule-${++nextCaptureId}`)
  const { theme } = policy
  const capsule = className === 'ui-backdrop-blur--pill'
  const opticalCapsule = capsule && (policy.androidGlass || policy.webGlass || policy.harmonyGlass)
  const radius = capsule ? (opticalCapsule ? CAPSULE_GLASS_RADIUS : CAPSULE_BLUR_RADIUS) : BACKDROP_BLUR_RADIUS

  if (!policy.blur) return null
  // Modal content uses themed blur. Glass is reserved for compact chrome.
  const nativeGlass = policy.liquidGlass && (capsule || className === 'ui-backdrop-blur--panel')
  const iosProps =
    platform === 'ios'
      ? {
          'blur-effect': nativeGlass ? ('glass' as const) : blurEffectFor(platform, theme),
          ...(nativeGlass ? { 'glass-style': 'regular' as const, 'glass-interactive': false } : {}),
          'ios-user-interface-style': theme,
        }
      : {}
  const androidProps = policy.androidCapture
    ? {
        'android-capture-target': captureTarget,
        'songloft-glass': capsule && policy.androidGlass,
        'songloft-glass-light': theme === 'light' ? 0.55 : 0.35,
      }
    : {}

  const blur = (
    <blur-view
      key={capsule && policy.webGlass ? 'glass' : 'blur'}
      className={className ? `ui-backdrop-blur ${className}${capsule && policy.webGlass ? ' ui-backdrop-blur--optical' : ''}` : 'ui-backdrop-blur'}
      blur-radius={radius}
      accessibility-element={false}
      {...iosProps}
      {...androidProps}
    />
  )
  if (!capsule || !policy.harmonyGlass) return blur
  return (
    <>
      <view id={captureId} className='ui-backdrop-blur ui-backdrop-blur--pill' flatten={false} accessibility-element={false}>
        {blur}
      </view>
      <songloft-capsule-glass
        className='ui-backdrop-blur ui-backdrop-blur--pill'
        capture-target={captureId}
        songloft-glass-light={theme === 'light' ? 0.55 : 0.35}
        accessibility-element={false}
      />
    </>
  )
}
