import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  act,
  fireEvent,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { Lexer } from 'marked'

const { open } = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('../../../native/native-platform.js', () => ({ openURL: open }))
import { Markdown } from '../Markdown.js'

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
const settle = async () => {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 10))
  })
}

test('renders headings, nested emphasis, lists, quotes, separators and literal code', async () => {
  render(
    <Markdown
      content={
        '# Release\n\n**bold *italic*** and ~~old~~ with `a < b`\n\n3. first\n4. second\n   - nested\n\n- [x] ready\n- [ ] pending\n\n> quoted\n\n---\n\n```sh\n  echo "**literal**"\n\nexit 0\n```'
      }
    />,
  )
  await settle()
  const root = elementTree.root!
  const queries = getQueriesForElement(root)
  expect(
    queries.getByText('Release').closest('.markdown__heading--1'),
  ).toBeInTheDocument()
  expect(
    queries.getByText('italic').closest('.markdown__em'),
  ).toBeInTheDocument()
  expect(root.querySelector('.markdown__strong')?.textContent).toBe(
    'bold italic',
  )
  expect(queries.getByText('old').closest('.markdown__del')).toBeInTheDocument()
  expect(queries.getByText('a < b')).toHaveClass('markdown__code')
  expect(
    [...root.querySelectorAll('.markdown__marker')].map(
      (node) => node.textContent,
    ),
  ).toEqual(['3.', '4.', '•', '☑', '☐'])
  expect(root.querySelector('.markdown__quote')?.textContent).toBe('quoted')
  expect(root.querySelector('.markdown__rule')).toBeInTheDocument()
  expect(
    root
      .querySelector('.markdown__code-block')
      ?.textContent?.replace(/\u00a0/g, ' '),
  ).toContain('  echo "**literal**"')
})

test('renders bilingual release table fixtures with inline formatting inside a horizontal scroller', async () => {
  const content = readFileSync(
    resolve(__dirname, 'fixtures/release-tables.md'),
    'utf8',
  )
  render(<Markdown content={content} />)
  await settle()
  const root = elementTree.root!
  const queries = getQueriesForElement(root)
  expect(
    queries.getByText('安装说明（中文）').closest('.markdown__heading--2'),
  ).toBeInTheDocument()
  expect(
    queries
      .getByText('Installation (English)')
      .closest('.markdown__heading--2'),
  ).toBeInTheDocument()
  const scrollers = root.querySelectorAll('.markdown__table-scroll')
  expect(scrollers).toHaveLength(2)
  for (const scroller of scrollers) {
    expect(scroller).toHaveAttribute('scroll-orientation', 'horizontal')
    expect(scroller.querySelectorAll('.markdown__table-row')).toHaveLength(6)
    expect(scroller.querySelectorAll('.markdown__table-header')).toHaveLength(3)
    expect(scroller.querySelector('.markdown__code')?.textContent).toBe(
      'songloft-lynx-android.apk',
    )
  }
  expect(root.textContent).not.toContain('| --- |')
})

test('links open through the host, reference links and GFM autolinks work, unsafe destinations remain readable', async () => {
  render(
    <Markdown
      content={
        '[docs](https://example.com/?a=1&amp;b=2) [ref][guide] https://example.org/\n\n[bad](javascript:alert%281%29) [local](file:///tmp/a) [relative](./guide.md)\n\n[guide]: https://example.net/guide'
      }
    />,
  )
  await settle()
  const root = elementTree.root!
  const queries = getQueriesForElement(root)
  await act(async () => {
    fireEvent.tap(queries.getByText('docs'))
  })
  expect(open).toHaveBeenLastCalledWith('https://example.com/?a=1&b=2')
  await act(async () => {
    fireEvent.tap(queries.getByText('ref'))
  })
  expect(open).toHaveBeenLastCalledWith('https://example.net/guide')
  await act(async () => {
    fireEvent.tap(queries.getByText('https://example.org/'))
  })
  expect(open).toHaveBeenLastCalledWith('https://example.org/')
  expect(root.querySelectorAll('.markdown__link')).toHaveLength(3)
  for (const label of ['bad', 'local', 'relative']) {
    expect(queries.getByText(label)).not.toHaveClass('markdown__link')
    await act(async () => {
      fireEvent.tap(queries.getByText(label))
    })
  }
  expect(open).toHaveBeenCalledTimes(3)
})

test('preserves escaped text, decodes entities once, uses image alt text and never creates HTML elements', async () => {
  render(
    <Markdown
      content={
        '&amp; &#x1F3B5; &#38;amp; \\*literal\\*\nsoft  \nbreak\n\n![cover](https://example.com/cover.png)\n\n<script>alert(1)</script>\n\n`&amp; <tag>`'
      }
    />,
  )
  await settle()
  const root = elementTree.root!
  expect(root.textContent).toContain('& 🎵 &amp; *literal* soft\u2028break')
  expect(root.textContent).toContain('cover')
  expect(root.textContent).toContain('<script>alert(1)</script>')
  expect(root.textContent).toContain('&amp; <tag>')
  expect(root.querySelector('script')).toBeNull()
  expect(root.querySelector('image')).toBeNull()
})

test('keeps GFM cell alignment and updates when the release content changes', async () => {
  const { rerender } = render(
    <Markdown
      content={'| left | right |\n| :--- | ---: |\n| one | **two** |'}
    />,
  )
  await settle()
  const root = elementTree.root!
  const cells = root.querySelectorAll('.markdown__table-cell > .markdown__text')
  expect(cells[0]?.getAttribute('style')).toContain('text-align: left')
  expect(cells[1]?.getAttribute('style')).toContain('text-align: right')
  rerender(<Markdown content='## Next release' />)
  await settle()
  expect(
    getQueriesForElement(root)
      .getByText('Next release')
      .closest('.markdown__heading--2'),
  ).toBeInTheDocument()
  expect(root.querySelector('.markdown__table-scroll')).toBeNull()
})

test('a parser failure leaves readable notes and updating the body recovers', async () => {
  const parser = vi.spyOn(Lexer, 'lex').mockImplementationOnce(() => {
    throw new Error('Malformed source')
  })
  const { rerender } = render(<Markdown content='## Failed source' />)
  await settle()
  const root = elementTree.root!
  expect(root.textContent).toContain('## Failed source')
  expect(root.querySelector('.markdown__heading')).toBeNull()
  parser.mockRestore()
  rerender(<Markdown content='## Recovered' />)
  await settle()
  expect(
    getQueriesForElement(root)
      .getByText('Recovered')
      .closest('.markdown__heading'),
  ).toBeInTheDocument()
  expect(root.textContent).not.toContain('Failed source')
})

test('autolink labels and destinations preserve literal entity-like text', async () => {
  render(<Markdown content={'https://example.com/?x=1&amp;y=2'} />)
  await settle()
  const queries = getQueriesForElement(elementTree.root!)
  await act(async () => {
    fireEvent.tap(queries.getByText('https://example.com/?x=1&amp;y=2'))
  })
  expect(open).toHaveBeenCalledExactlyOnceWith(
    'https://example.com/?x=1&amp;y=2',
  )
})
