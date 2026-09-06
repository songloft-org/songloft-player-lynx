import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Every localized string in this app is Chinese, and an editing tool that
 * mangles a multi-byte sequence leaves behind U+FFFD, the replacement character.
 * U+FFFD is itself *valid* UTF-8, so nothing downstream complains: it typechecks,
 * it bundles, and it ships — rendering as a black diamond mid-sentence on screen.
 *
 * This has already shipped twice. `1f02383` fixed a round of it ("修复中文乱码"),
 * then `580e002` reintroduced one line and `4868733` a second — so the remove-song
 * confirm dialog read 「确定从该歌单移<?><?>这首歌<?><?><?>？」 and the unpin toast read
 * 「歌单已<?><?>消置顶」 in production.
 *
 * i18n.test.ts could not catch it: its completeness checks prove en/zh agree on
 * the *key set* and that every leaf is a non-empty string. A corrupted string is
 * still a non-empty string, and corruption never touches keys. Contrast is the
 * same story elsewhere in this repo — a gate that asserts the wrong axis is
 * green while the defect is on screen.
 *
 * So this gate works on the byte level over the whole source tree, not on the
 * resource tree: no source file may contain U+FFFD, and no source file may hold
 * bytes that are not valid UTF-8 at all (the same mangling, caught one step
 * earlier, before some editor "repairs" it into U+FFFD).
 *
 * `docs/` is in scope for the same reason the root rule docs are, and it was
 * added the hard way: editing `docs/project/progress.md` smashed five unrelated
 * CJK characters elsewhere in that file into 14 U+FFFD, and nothing noticed —
 * the gate did not read `docs/`, and the ad-hoc `grep` used to double-check it
 * was written with a bash-only `$'\xef\xbf\xbd'` quote that `/bin/sh` passes
 * through literally, so it searched for nothing and reported clean. A gate that
 * covers the tree is the only version of this check that cannot be forgotten.
 *
 * If prose ever needs to *discuss* the character, name it "U+FFFD" or build it
 * from its code point — never paste the literal glyph, or this gate flags itself.
 */

const ROOT = path.resolve(__dirname, '..', '..')

/** Directories of hand-written source and prose this gate is responsible for. */
const SCANNED_DIRS = ['src', 'web', 'scripts', 'e2e', 'docs']

/** Rule/reference docs at the repo root — a mangled invariant is worse than a mangled string. */
const SCANNED_ROOT_FILES = ['AGENTS.md', 'README.md', 'DESIGN.md']

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.md',
  '.html',
  '.svg',
  '.yml',
  '.yaml',
])

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.rspeedy', '.git'])

function collect(dir: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return // an optional directory (e.g. e2e) may be absent in a partial checkout
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out)
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full)
    }
  }
}

function sourceFiles(): string[] {
  const files: string[] = []
  for (const dir of SCANNED_DIRS) collect(path.join(ROOT, dir), files)
  for (const name of SCANNED_ROOT_FILES) {
    const full = path.join(ROOT, name)
    try {
      if (statSync(full).isFile()) files.push(full)
    } catch {
      // not every checkout carries every root doc
    }
  }
  return files
}

/** U+FFFD, built from its code point so this file never contains the literal glyph. */
const REPLACEMENT = String.fromCharCode(0xfffd)

describe('source encoding (bugs.md: 中文字符串被编辑工具打碎成 U+FFFD)', () => {
  const files = sourceFiles()

  test('the scan actually reaches the source tree', () => {
    // Without this, a broken walk turns every assertion below into a no-op pass.
    expect(files.length, 'no sources scanned — the walk is broken').toBeGreaterThan(500)
    expect(files, 'resources.ts is the file that shipped the defect twice').toContain(
      path.join(ROOT, 'src', 'i18n', 'resources.ts'),
    )
    expect(files.some((f) => f.endsWith('.css')), 'stylesheets carry CJK comments too').toBe(true)
    // `docs/` is where the most recent round of this landed, and it is nearly all
    // CJK prose — a walk that silently skips it puts the gate back where it was.
    expect(files, 'docs/ must be scanned, not just src/').toContain(
      path.join(ROOT, 'docs', 'project', 'progress.md'),
    )
    expect(
      files.filter((f) => f.startsWith(path.join(ROOT, 'docs'))).length,
      'only a handful of docs reached — the docs walk is broken',
    ).toBeGreaterThan(20)
  })

  test('no source file contains the Unicode replacement character', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      if (!text.includes(REPLACEMENT)) continue
      text.split('\n').forEach((line, index) => {
        if (line.includes(REPLACEMENT)) {
          offenders.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim().slice(0, 80)}`)
        }
      })
    }
    expect(offenders, 'these render as a black diamond on screen — restore the original text').toEqual([])
  })

  test('no source file holds bytes that are not valid UTF-8', () => {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const offenders: string[] = []
    for (const file of files) {
      try {
        decoder.decode(readFileSync(file))
      } catch {
        offenders.push(path.relative(ROOT, file))
      }
    }
    expect(offenders, 'undecodable bytes — the file was written with a broken encoder').toEqual([])
  })

  test('the detector recognizes the defect shape it is meant to catch', () => {
    // Defect-shape check: a green suite must mean "clean", not "detector broken".
    const mangled = `确定从该歌单移${REPLACEMENT}${REPLACEMENT}这首歌`
    expect(mangled.includes(REPLACEMENT)).toBe(true)
    expect('确定从该歌单移除这首歌曲？'.includes(REPLACEMENT)).toBe(false)

    const decoder = new TextDecoder('utf-8', { fatal: true })
    // A truncated 3-byte CJK sequence — what a byte-slicing editor leaves behind.
    expect(() => decoder.decode(new Uint8Array([0xe7, 0xa1]))).toThrow()
    expect(decoder.decode(new Uint8Array([0xe7, 0xa1, 0xae]))).toBe('确')
  })
})
