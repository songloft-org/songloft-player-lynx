import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { expect, test, vi } from 'vitest'

const require = createRequire(import.meta.url)
const root = path.dirname(require.resolve('@lynx-js/web-core/package.json'))
const source = readFileSync(
  path.join(root, 'dist/client_prod/static/js/async/web-core-main-chunk.js'),
  'utf8',
)
const start = source.indexOf('enableElementEvent(')
const end = source.indexOf('setAttribute(', start)
function fixture() {
  let resolve!: () => void
  const ready = new Promise<void>((r) => {
    resolve = r
  })
  const Binding = vm.runInNewContext(
    `(class { ${source.slice(start, end)} })`,
    {
      i: { im: { input: 'lynxinput' } },
      Map,
      customElements: { whenDefined: () => ready },
    },
  )
  const element: {
    localName: string
    enableEvent?: ReturnType<typeof vi.fn>
    disableEvent?: ReturnType<typeof vi.fn>
  } = { localName: 'x-input' }
  let current: typeof element | undefined = element
  return {
    binding: new Binding(),
    element,
    ref: { deref: () => current },
    upgrade: async () => {
      element.enableEvent = vi.fn()
      element.disableEvent = vi.fn()
      resolve()
      await ready
    },
    remove: () => {
      current = undefined
    },
  }
}
test('bindings arriving before element upgrade replay once with the renamed event', async () => {
  const f = fixture()
  f.binding.enableElementEvent(f.ref, 'input')
  await f.upgrade()
  expect(f.element.enableEvent).toHaveBeenCalledExactlyOnceWith('lynxinput')
})
test('a binding removed before upgrade is not enabled afterward', async () => {
  const f = fixture()
  f.binding.enableElementEvent(f.ref, 'input')
  f.binding.disableElementEvent(f.ref, 'input')
  await f.upgrade()
  expect(f.element.enableEvent).not.toHaveBeenCalled()
})
test('multiple pending handlers retain their counts and ignore destroyed nodes', async () => {
  const f = fixture()
  f.binding.enableElementEvent(f.ref, 'input')
  f.binding.enableElementEvent(f.ref, 'input')
  f.binding.disableElementEvent(f.ref, 'input')
  await f.upgrade()
  expect(f.element.enableEvent).toHaveBeenCalledOnce()
  f.binding.disableElementEvent(f.ref, 'input')
  expect(f.element.disableEvent).toHaveBeenCalledExactlyOnceWith('lynxinput')
  const gone = fixture()
  gone.binding.enableElementEvent(gone.ref, 'input')
  gone.remove()
  await gone.upgrade()
  expect(gone.element.enableEvent).not.toHaveBeenCalled()
})
