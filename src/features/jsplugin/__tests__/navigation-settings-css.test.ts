import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

const CSS = readFileSync(
  resolve(process.cwd(), 'src/features/jsplugin/widgets/PluginNavigationSettings.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

test('plugin navigation rows animate when SortableRoot shifts their slots', () => {
  const match = /\.tab-config__order-row\s*\{([^}]*)\}/m.exec(CSS)
  expect(match, 'missing plugin navigation order row rule').not.toBeNull()
  expect(match![1]).toMatch(/transition:\s*transform\s+var\(--duration-fast\)\s+var\(--ease-default\)/)
})
