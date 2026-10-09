import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { jsxElements } from '../shared/testing/jsx-elements.js'

const read = (path: string) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8')

test('Android capture sources are real views and exclude panel blur descendants', () => {
  for (const path of ['src/shared/layouts/ShellLayout.tsx', 'src/features/player/widgets/PlayerBackdrop.tsx']) {
    const sources = jsxElements(read(path)).filter((element) => /id=['"]songloft-backdrop['"]/.test(element.tag))
    expect(sources).toHaveLength(1)
    expect(sources[0]!.tag).toMatch(/flatten=\{false\}/)
    expect(sources[0]!.body).not.toMatch(/<BackdropBlur|<MiniPlayer/)
  }
})

test('the iOS registered BlurView dependency and guarded OS capability remain paired', () => {
  expect(read('ios/Podfile.lock')).toContain('XElement/BlurView (4.0.1)')
  const system = read('ios/SongloftLynx/SystemAppearance.swift')
  expect(system).toMatch(/if #available\(iOS 26\.0, \*\) \{ return true \}/)
  expect(system).toContain('LynxVersion.versionString()')
  const view = read('ios/SongloftLynx/ViewController.swift')
  for (const name of ['reduceMotion', 'reduceTransparency', 'darkerSystemColors']) {
    expect(view).toContain(`UIAccessibility.${name}StatusDidChangeNotification`)
  }
  expect(view).toMatch(/for observer in accessibilityObservers[\s\S]*?removeObserver\(observer\)/)
})

test('Android advertises AGSL at API 33 and applies it only to the decorative native leaf', () => {
  const system = read('android/app/src/main/java/org/songloft/lynx/system/SystemAppearance.kt')
  expect(system).toMatch(/"androidGlassSupported" to \(Build.VERSION.SDK_INT >= 33\)/)
  const blur = read('android/app/src/main/java/org/songloft/lynx/ui/SongloftBlurUI.kt')
  expect(blur).toContain('@LynxProp(name = "songloft-glass"')
  expect(blur).toContain('if (Build.VERSION.SDK_INT < 33) return')
  expect(blur).toContain('override fun onSizeChanged')
  expect(blur).toMatch(/disposeCallbacks\(\)[\s\S]*setRenderEffect\(null\)/)
  const shader = read('android/app/src/main/java/org/songloft/lynx/ui/GlassRefraction.kt')
  expect(shader).toContain('createRuntimeShaderEffect(shader, "backdrop")')
  expect(shader).toContain('backdrop.eval(samplePosition)')
  expect(shader).toContain('if (distance >= 0.5) return half4(0)')
  expect(shader).toContain('original.a * coverage')
  expect(shader).not.toMatch(/ValueAnimator|Choreographer/)
})
