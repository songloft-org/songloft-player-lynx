import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { afterEach, expect, test, vi } from 'vitest'

interface Result { error: string | null; body: string | null }
interface Host {
  pickTextFile(options: typeof labels): Promise<Result>
  saveTextFile(options: typeof labels & { text: string; fileName: string }): Promise<Result>
  cancelTextFile(): void
}
const labels = { title: '导入歌单', choose: '选择 JSON', save: '下载 JSON', cancel: '取消' }
interface Dom { window: Window & typeof globalThis }
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string }) => Dom
}
const windows: Dom[] = []
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); vi.useRealTimers() })

function setup(activated = false) {
  const dom = new JSDOM('<body><button id="previous">App</button></body>', { url: 'https://example.test' })
  windows.push(dom)
  const revoked = vi.fn()
  const blobs: Blob[] = []
  const context = vm.createContext({
    window: dom.window, document: dom.window.document, navigator: { userActivation: { isActive: activated } },
    Blob, URL: { createObjectURL: (blob: Blob) => { blobs.push(blob); return 'blob:fixture' }, revokeObjectURL: revoked },
    setTimeout,
  })
  vm.runInContext(readFileSync(resolve(__dirname, '../../web/file-transfer-host.js'), 'utf8'), context)
  return { document: dom.window.document, window: dom.window, revoked, blobs,
    host: (dom.window as unknown as { __SONGLOFT_TEXT_FILES__: Host }).__SONGLOFT_TEXT_FILES__ }
}

test('lost activation offers a real file control, returns Unicode text and removes every DOM control', async () => {
  const { document, window, host } = setup()
  const request = host.pickTextFile(labels)
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(labels.title)
  const input = document.querySelector('input')!
  expect(input.type).toBe('file')
  Object.defineProperty(input, 'files', { value: [{ size: 10, text: async () => '歌单🎵' }] })
  input.dispatchEvent(new window.Event('change'))
  expect(await request).toEqual({ error: null, body: '歌单🎵' })
  expect(document.querySelector('[data-songloft-transfer]')).toBeNull()
  expect(document.querySelector('input')).toBeNull()
})

test('cancel, file-dialog cancel and oversized/read-failed files settle and allow the next request', async () => {
  const { host, document, window } = setup()
  const first = host.pickTextFile(labels)
  expect((await host.pickTextFile(labels)).error).toBe('file_transfer_busy')
  document.querySelector('button:last-child')!.dispatchEvent(new window.Event('click'))
  expect((await first).error).toBe('cancelled')
  const second = host.pickTextFile(labels)
  document.querySelector('input')!.dispatchEvent(new window.Event('cancel'))
  expect((await second).error).toBe('cancelled')
  for (const [file, error] of [
    [{ size: 20 * 1024 * 1024 + 1, text: async () => '' }, 'file_too_large'],
    [{ size: 1, text: async () => { throw new Error('unreadable') } }, 'file_read_failed'],
  ] as const) {
    const next = host.pickTextFile(labels)
    const input = document.querySelector('input')!
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new window.Event('change'))
    expect((await next).error).toBe(error)
  }
  expect(document.querySelector('input')).toBeNull()
})

test('route cancellation during file reading wins over late completion', async () => {
  const { host, document, window } = setup()
  let read!: (value: string) => void
  const pending = host.pickTextFile(labels)
  const input = document.querySelector('input')!
  Object.defineProperty(input, 'files', { value: [{ size: 1, text: () => new Promise<string>(resolve => { read = resolve }) }] })
  input.dispatchEvent(new window.Event('change'))
  host.cancelTextFile()
  read('late')
  expect((await pending).error).toBe('cancelled')
  const next = host.pickTextFile(labels)
  host.cancelTextFile()
  expect((await next).error).toBe('cancelled')
})

test('downloads preserve UTF-8 and revoke the blob after click; cancel revokes immediately', async () => {
  vi.useFakeTimers()
  const { host, document, window, blobs, revoked } = setup()
  const save = host.saveTextFile({ ...labels, text: '中文🎵', fileName: 'backup.json' })
  const anchor = document.querySelector('a')!
  expect(anchor.download).toBe('backup.json')
  expect(await blobs[0]!.text()).toBe('中文🎵')
  anchor.dispatchEvent(new window.Event('click'))
  await vi.advanceTimersByTimeAsync(0)
  expect((await save).error).toBeNull()
  expect(revoked).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  expect(revoked).toHaveBeenCalledTimes(1)
  const cancelled = host.saveTextFile({ ...labels, text: '{}', fileName: 'backup.json' })
  host.cancelTextFile()
  expect((await cancelled).error).toBe('cancelled')
  expect(revoked).toHaveBeenCalledTimes(2)
  expect(document.querySelector('a')).toBeNull()
})

test('the activated path opens a picker without a fallback panel and also cancels cleanly', async () => {
  const { host, document, window } = setup(true)
  const click = vi.spyOn(window.HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  const pending = host.pickTextFile(labels)
  expect(click).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  host.cancelTextFile()
  expect((await pending).error).toBe('cancelled')
  expect(document.querySelector('input')).toBeNull()
})
