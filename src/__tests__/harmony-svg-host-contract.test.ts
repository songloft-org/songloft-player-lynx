import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

const repoRoot = path.resolve(__dirname, '../..')
const read = (relative: string): string =>
  readFileSync(path.join(repoRoot, relative), 'utf8')

describe('HarmonyOS SVG host integration', () => {
  const index = read('harmony/entry/src/main/ets/pages/Index.ets')
  const ohPackage = read('harmony/entry/oh-package.json5')

  test('installs the Harmony SVG XElement matching the Lynx SDK', () => {
    expect(ohPackage).toContain('"@lynx/xelement_svg": "4.0.1"')
  })

  test('registers the svg behavior on the LynxView', () => {
    expect(index).toContain("import { UISVG } from '@lynx/xelement_svg'")
    expect(index).toContain("['svg', new Behavior(UISVG, undefined)]")
    expect(index).toContain('behaviors: this.behaviors')
  })
})

describe('HarmonyOS image host integration', () => {
  const ability = read(
    'harmony/entry/src/main/ets/entryability/EntryAbility.ets',
  )
  const index = read('harmony/entry/src/main/ets/pages/Index.ets')
  const moduleProfile = read('harmony/entry/src/main/module.json5')
  const ohPackage = read('harmony/entry/oh-package.json5')
  const abilityStage = read(
    'harmony/entry/src/main/ets/entryability/LynxAbilityStage.ets',
  )
  const genericFetcher = read(
    'harmony/entry/src/main/ets/net/SongloftGenericResourceFetcher.ets',
  )
  const mediaFetcher = read(
    'harmony/entry/src/main/ets/net/SongloftMediaResourceFetcher.ets',
  )
  const copyScript = read('scripts/copy-bundle-harmony.mjs')

  test('registers image and HTTP services before initializing Lynx', () => {
    const initialize = ability.indexOf('LynxEnv.initialize(this.context)')
    const image = ability.indexOf(
      'LynxServiceCenter.registerService(LynxServiceType.Image, LynxImageService.instance)',
    )
    const http = ability.indexOf('SongloftHttpService.register()')

    expect(initialize).toBeGreaterThan(-1)
    expect(image).toBeGreaterThan(-1)
    expect(http).toBeGreaterThan(-1)
    expect(image).toBeLessThan(initialize)
    expect(http).toBeLessThan(initialize)
  })

  test('provides the generic image downloader required by Harmony Lynx', () => {
    expect(ohPackage).toContain('"@ohos/imageknifepro": "1.0.9"')
    expect(moduleProfile).toContain(
      '"srcEntry": "./ets/entryability/LynxAbilityStage.ets"',
    )
    expect(abilityStage).toContain(
      'ImageKnife.getInstance().initFileCache(this.context)',
    )
    expect(genericFetcher).toContain(
      'extends LynxGenericResourceFetcher',
    )
    expect(genericFetcher).toContain(
      'ImageKnife.getInstance().preloadCache(option)',
    )
    expect(index).toContain(
      'genericResourceFetcher: this.genericResourceFetcher',
    )
  })

  test('packages and redirects the local app icon as a raw resource', () => {
    expect(copyScript).toContain("resolve(root, 'web/app_icon.png')")
    expect(copyScript).toContain('copyFileSync(iconSrc, iconDest)')
    expect(mediaFetcher).toContain("return 'resource://rawfile/app_icon.png'")
  })
})
