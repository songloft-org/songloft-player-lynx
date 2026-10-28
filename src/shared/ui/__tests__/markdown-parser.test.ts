import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { parseMarkdown } from '../markdown-parser.js'

test('parses release tables, emphasis and reference links without the APIs missing in Android PrimJS', () => {
  const content =
    readFileSync(
      resolve(__dirname, 'fixtures/release-tables.md'),
      'utf8',
    ) +
    '\n\n[guide][docs]\n\n[docs]: https://example.com/guide\n\n- **fixed**\n  - nested\n\n> note\n'
  const at = Object.getOwnPropertyDescriptor(Array.prototype, 'at')!
  const hasOwn = Object.getOwnPropertyDescriptor(Object, 'hasOwn')!
  let tokens: ReturnType<typeof parseMarkdown>
  let compatibility: unknown[] = []
  try {
    Object.defineProperty(Array.prototype, 'at', { ...at, value: undefined })
    Object.defineProperty(Object, 'hasOwn', { ...hasOwn, value: undefined })
    tokens = parseMarkdown(content)
    const record = Object.create({ inherited: true }) as Record<string, unknown>
    Object.defineProperty(record, 'hasOwnProperty', { value: false })
    compatibility = [
      ['a', 'b'].at(-1),
      ['a', 'b'].at(-1.9),
      ['a', 'b'].at(NaN),
      ['a', 'b'].at(Infinity),
      ['a', 'b'].at(-Infinity),
      ['a', 'b'].at(2),
      Object.hasOwn(record, 'hasOwnProperty'),
      Object.hasOwn(record, 'inherited'),
      Object.getOwnPropertyDescriptor(Array.prototype, 'at')!.enumerable,
      Object.getOwnPropertyDescriptor(Object, 'hasOwn')!.enumerable,
    ]
  } finally {
    Object.defineProperty(Array.prototype, 'at', at)
    Object.defineProperty(Object, 'hasOwn', hasOwn)
  }
  expect(tokens!).not.toBeNull()
  expect(compatibility).toEqual([
    'b',
    'b',
    'a',
    undefined,
    undefined,
    undefined,
    true,
    false,
    false,
    false,
  ])
  expect(tokens!.filter((token) => token.type === 'table')).toHaveLength(2)
  expect(
    tokens!.find(
      (token) =>
        token.type === 'paragraph' &&
        token.tokens?.some((inline) => inline.type === 'link'),
    ),
  ).toBeDefined()
  expect(tokens!.some((token) => token.type === 'list')).toBe(true)
  expect(tokens!.some((token) => token.type === 'blockquote')).toBe(true)
})

test('keeps existing built-ins when the runtime already supports them', () => {
  const at = Array.prototype.at
  const hasOwn = Object.hasOwn
  expect(parseMarkdown('**already supported**')).not.toBeNull()
  expect(Array.prototype.at).toBe(at)
  expect(Object.hasOwn).toBe(hasOwn)
})
