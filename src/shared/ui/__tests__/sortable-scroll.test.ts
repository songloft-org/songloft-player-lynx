import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'
import { expect, test, vi } from 'vitest'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('@lynx-js/lynx-ui-sortable'))

// Execute the installed scroll controller, preserving the two host contracts:
// native consumes offset, HTMLElement.scrollBy consumes top and returns void.
for (const file of ['Sortable.jsx', '../src/Sortable.tsx']) {
  test(`${file} refreshes the running controller when pagination changes the row keys`, () => {
    const source = ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let initializer: ts.Expression | undefined
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'refreshAutoScrollFrame') initializer = node.initializer
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(initializer).toBeDefined()
    const code = ts.transpile(`const refresh = ${initializer!.getText(source)};`, { target: ts.ScriptTarget.ES2022 })
    const previous = vi.fn()
    const latest = vi.fn()
    const active = { current: true }
    const frame = { current: previous }
    const refresh = new Function('useCallback', 'autoScrollingRef', 'autoScrollFrameRef', 'runAutoScrollFrame', `${code}; return refresh`)((fn: unknown) => fn, active, frame, latest) as () => void
    refresh()
    frame.current()
    expect(latest).toHaveBeenCalledOnce()
    expect(previous).not.toHaveBeenCalled()
    active.current = false
    frame.current = previous
    refresh()
    expect(frame.current).toBe(previous)
  })
  for (const host of ['native', 'web']) {
    test(`${file} scrolls ${host} with the real host parameter shape`, async () => {
      const source = ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      let initializer: ts.Expression | undefined
      function visit(node: ts.Node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'scrollScrollableBoundaryBy') initializer = node.initializer
        ts.forEachChild(node, visit)
      }
      visit(source)
      expect(initializer).toBeDefined()
      const code = ts.transpile(`const scroll = ${initializer!.getText(source)};`, { target: ts.ScriptTarget.ES2022 })
      let scrollTop = 100
      const invoke = vi.fn(async (_method: string, params: { offset: number; top?: number; behavior?: string }) => {
        scrollTop += host === 'native' ? params.offset : params.top ?? 0
        return host === 'native' ? { scrollTop } : undefined
      })
      const sync = vi.fn()
      const callback = vi.fn()
      const scroll = new Function('useCallback', 'scrollableBoundaryId', 'lynx', 'syncScrollDeltaForItemTranslateY', 'autoScrollingRef', 'sortingKey', `${code}; return scroll`)(
        (fn: unknown) => fn, 'test-scroll', { querySelector: () => ({ invoke }) }, sync, {}, '1',
      ) as (offset: number, onScrolled: () => void) => void
      scroll(18, callback)
      await Promise.resolve()
      await Promise.resolve()
      expect(scrollTop).toBe(118)
      if (host === 'web') expect(invoke.mock.calls[0]![1].behavior).toBe('instant')
      expect(invoke.mock.calls[0]![0]).toBe('scrollBy')
      expect(sync).toHaveBeenCalledWith(host === 'native' ? { scrollTop: 118 } : undefined, 18)
      expect(callback).toHaveBeenCalledOnce()
      scroll(-18, callback)
      await Promise.resolve()
      await Promise.resolve()
      expect(scrollTop).toBe(100)
      scroll(0, callback)
      expect(invoke).toHaveBeenCalledTimes(2)
    })
  }
}
