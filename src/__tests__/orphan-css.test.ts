import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { expect, test } from 'vitest'

const SRC = resolve(process.cwd(), 'src')

/** Every file under `src` ending in one of `exts`. */
function walk(dir: string, exts: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) return walk(full, exts)
    return exts.some((e) => entry.name.endsWith(e)) ? [full] : []
  })
}

/**
 * Every stylesheet under `src` must be reachable from an `import`.
 *
 * Two files had been dead since the HIG migration and were deleted in batch 68:
 * both carried a confident header ("Consumed by new code; existing callers keep
 * their class names until migrated per-file") and neither was imported by
 * anything. 152 lines that nothing could ever notice — an unimported stylesheet
 * cannot fail, warn, or appear in a measurement.
 *
 * The worse half of the finding is the one this gate is really about: pieces of
 * that dead CSS were still *named in markup* (`page page--centered` on `/login`,
 * `muse-card`, `luna-button` in the files' own headers), so a reader asking
 * "which rules style this element" got an answer that was never true — the
 * class names resolved to nothing at runtime. Deleting the files without this
 * gate would leave the next author free to write another one.
 *
 * Roster derived from usage, as everywhere else here: read the import
 * specifiers, never keep a list of the live files.
 */
test('every stylesheet under src is imported by something', () => {
  const imported = new Set<string>()
  for (const file of walk(SRC, ['.ts', '.tsx'])) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bimport\s+['"]([^'"]+\.css)['"]/g)) {
      imported.add(resolve(file, '..', m[1]!))
    }
  }
  const orphans = walk(SRC, ['.css'])
    .filter((f) => !imported.has(f))
    .map((f) => relative(SRC, f))
    .sort()
  expect(
    orphans,
    `unimported stylesheet(s) — delete them or import them from the screen that\n`
    + `uses their classes:\n  ${orphans.join('\n  ')}`,
  ).toEqual([])
})

test('the import specifiers themselves resolve', () => {
  // The other direction, and the cheaper failure to write: a stylesheet can be
  // renamed and leave one call site pointing at nothing. rspeedy treats a
  // missing CSS import as an error, so this is a fast local signal rather than a
  // new class of bug — but it costs three lines next to the check above.
  const missing: string[] = []
  for (const file of walk(SRC, ['.ts', '.tsx'])) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bimport\s+['"]([^'"]+\.css)['"]/g)) {
      const target = resolve(file, '..', m[1]!)
      try {
        readFileSync(target)
      }
      catch {
        missing.push(`${relative(SRC, file)} → ${m[1]}`)
      }
    }
  }
  expect(missing, `imports pointing at no file:\n  ${missing.join('\n  ')}`).toEqual([])
})
