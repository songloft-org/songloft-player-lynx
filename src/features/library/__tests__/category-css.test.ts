import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

const CSS = readFileSync(
  resolve(process.cwd(), 'src/features/library/pages/CategorySongsPage.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS)
  expect(match, `no rule for \`${selector}\``).not.toBeNull()
  return match![1]!
}

test('category detail uses the same compact topbar spacing as playlist detail on narrow screens', () => {
  expect(ruleFor('.category-songs__topbar')).toMatch(
    /padding:\s*var\(--space-3\)\s+var\(--space-4\)/,
  )
  expect(ruleFor('.shell--narrow .category-songs__topbar')).toMatch(
    /padding:\s*var\(--space-2\)\s+var\(--space-3\)/,
  )
})
