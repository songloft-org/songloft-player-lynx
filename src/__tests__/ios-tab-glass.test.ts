import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const read = (path: string) => readFileSync(resolve(__dirname, '../../', path), 'utf8')
const native = read('ios/SongloftLynx/SongloftTabGlassUI.m')

// These check wiring and API use. C clock verification and actual Apple
// compilation/rendering are separate gates, not simulated UIKit successes.
test('iOS glass is registered before the root and advertises OS, build-SDK and actual registration gates', () => {
  const app = read('ios/SongloftLynx/AppDelegate.swift')
  const appearance = read('ios/SongloftLynx/SystemAppearance.swift')
  expect(app).toContain('SongloftTabGlassUI.registerComponent()')
  expect(native).toContain('registerUI:self withName:@"songloft-tab-glass"')
  expect(native).toContain('(__IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_26_0)')
  expect(native).toContain('@available(iOS 26.0, *)')
  expect(native).toContain('uiClassWithName:@"songloft-tab-glass" accessible:&legal] == self && legal')
  expect(appearance).toContain('"iosTabGlassSupported": supportsLiquidGlass && SongloftTabGlassUI.isRegistered()')
  expect(appearance).toContain('return SongloftTabGlassUI.supportsSystemGlass()')
  const project = read('ios/SongloftLynx.xcodeproj/project.pbxproj')
  expect(project).toContain('AF0000000000000000000001 /* SongloftTabGlassUI.m in Sources */,')
  expect(read('ios/SongloftLynx/SongloftLynx-Bridging-Header.h')).toContain('#import "SongloftTabGlassUI.h"')
})

test('native material interpolates effect on the shared clock and keeps effect/ancestor alpha intact', () => {
  expect(native).toContain('UIGlassEffectStyleClear')
  expect(native).toContain('animations:^{ weakSelf.effect = glass; }')
  expect(native).toContain('_material.fractionComplete = sample.engagement')
  expect(native).toContain('SongloftTabGlassSampleAt(_frames.bytes')
  expect(native).not.toMatch(/\.(?:alpha|hidden)\s*=/)
  const component = read('src/shared/layouts/LiquidTabIndicator.tsx')
  expect(component).not.toContain('opticalRef.current?.animate(')
  expect(component).not.toContain("opticalRef.current?.setStyleProperty('opacity'")
  expect(component).toContain('<view className=\'nav-indicator__wash\'')
  expect(component.indexOf('<songloft-tab-glass')).toBeLessThan(component.indexOf("className='nav-indicator__wash'"))
})

test('display links and paused material animations cancel on settling, accessibility, background and removal', () => {
  expect(native).toContain('@property(nonatomic, weak) SongloftTabGlassView *view')
  expect(native).toContain('if (sample.complete) { [self cancelGlass]; return; }')
  expect(native).toContain('if (!self.window) [self cancelGlass]')
  expect(native).toContain('UIApplicationDidEnterBackgroundNotification')
  expect(native).toContain('UIAccessibilityReduceMotionStatusDidChangeNotification')
  expect(native).toContain('UIAccessibilityReduceTransparencyStatusDidChangeNotification')
  expect(native).toContain('UIAccessibilityDarkerSystemColorsStatusDidChangeNotification')
  expect(native).toContain('[_displayLink invalidate]')
  expect(native).toContain('[_material stopAnimation:YES]')
  expect(native).toContain('[super detachView]')
  expect(native).toContain('[NSNotificationCenter.defaultCenter removeObserver:self]')
})
