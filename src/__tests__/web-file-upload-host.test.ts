import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, expect, test, vi } from 'vitest'
import { webPickAndUploadFile } from '../native/web-platform.js'

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis }
}
type Result = { error: string | null; body: string | null }
const windows: Array<Window & typeof globalThis> = []
afterEach(() => {
  windows.splice(0).forEach((window) => window.close())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup() {
  const { window } = new JSDOM('<body><button id="previous">App</button><lynx-view id="app"></lynx-view></body>', {
    url: 'https://music.example/songloft/',
  })
  windows.push(window)
  const fetch = vi.fn(async () => ({ ok: true, text: async () => '{"success":1}' }))
  const context = vm.createContext({
    window,
    document: window.document,
    navigator: window.navigator,
    Audio: window.Audio,
    URL,
    FormData: window.FormData,
    AbortController,
    fetch,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  })
  for (const file of ['file-transfer-host.js', 'audio-host.js']) {
    vm.runInContext(readFileSync(resolve(__dirname, '../../web', file), 'utf8'), context)
  }
  const app = window.document.getElementById('app') as HTMLElement & {
    onNativeModulesCall(method: string, args: unknown[], module: string): Promise<Result>
  }
  const start = () =>
    app.onNativeModulesCall(
      'pickAndUploadFile',
      ['/songloft/api/v1/jsplugins/upload?token=fixture', 'plugin', 'application/zip'],
      'SongloftPlatform',
    )
  const choose = () => {
    const input = window.document.querySelector('input')!
    Object.defineProperty(input, 'files', {
      value: [new window.File(['fixture'], 'plugin.zip', { type: 'application/zip' })],
    })
    input.dispatchEvent(new window.Event('change'))
    return input
  }
  return { window, document: window.document, fetch, start, choose }
}

test('Worker upload RPC offers a visible file control without programmatic activation, then sends multipart and cleans up', async () => {
  const h = setup()
  const click = vi.spyOn(h.window.HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  h.document.getElementById('previous')!.focus()
  const task = h.start()
  expect(click).not.toHaveBeenCalled()
  const input = h.document.querySelector('input')!
  expect(input.closest('[role="dialog"]')).not.toBeNull()
  expect(input.style.display).not.toBe('none')
  expect(input.accept).toContain('.zip')
  expect(h.fetch).not.toHaveBeenCalled()
  h.choose()
  expect(await task).toEqual({ error: null, body: '{"success":1}' })
  const [url, options] = h.fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/songloft/api/v1/jsplugins/upload?token=fixture')
  expect(options.method).toBe('POST')
  expect(options.credentials).toBe('same-origin')
  expect((options.body as FormData).get('plugin')).toHaveProperty('name', 'plugin.zip')
  expect(h.document.querySelector('[role="dialog"]')).toBeNull()
  expect(h.document.activeElement?.id).toBe('previous')
})

test('panel cancel and picker cancel settle without uploading and allow retry', async () => {
  const h = setup()
  const first = h.start()
  expect((await h.start()).error).toBe('file_transfer_busy')
  h.document.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click()
  expect((await first).error).toBe('cancelled')
  const second = h.start()
  h.document.querySelector('input')!.dispatchEvent(new h.window.Event('cancel'))
  expect((await second).error).toBe('cancelled')
  expect(h.fetch).not.toHaveBeenCalled()
  const third = h.start()
  h.choose()
  expect((await third).error).toBeNull()
})

test('HTTP and network errors settle and leave the next upload available', async () => {
  const h = setup()
  for (const error of ['HTTP 401', 'offline']) {
    if (error === 'HTTP 401') h.fetch.mockResolvedValueOnce({ ok: false, status: 401 } as never)
    else h.fetch.mockRejectedValueOnce(new Error('offline'))
    const task = h.start()
    h.choose()
    expect((await task).error).toBe(error)
    expect(h.document.querySelector('input')).toBeNull()
  }
})

test('cancelling an upload aborts transport, ignores late success and permits a new request', async () => {
  const h = setup()
  let finish!: (value: { ok: boolean; text: () => Promise<string> }) => void
  h.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const task = h.start()
  h.choose()
  const options = (h.fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
  h.document.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click()
  expect((await task).error).toBe('cancelled')
  expect(options.signal?.aborted).toBe(true)
  const next = h.start()
  finish({ ok: true, text: async () => 'late' })
  await Promise.resolve()
  expect(h.document.querySelector('[role="dialog"]')).not.toBeNull()
  h.choose()
  expect((await next).body).toBe('{"success":1}')
})

test('the upload deadline begins after selection and aborts a stalled request', async () => {
  vi.useFakeTimers()
  const h = setup()
  h.fetch.mockImplementationOnce(() => new Promise(() => {}))
  const task = h.start()
  await vi.advanceTimersByTimeAsync(300000)
  expect(h.document.querySelector('input')).not.toBeNull()
  h.choose()
  const options = (h.fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
  await vi.advanceTimersByTimeAsync(240000)
  expect(h.document.querySelector('[role="dialog"]')).toBeNull()
  expect((await task).error).toBe('Upload timed out')
  expect(options.signal?.aborted).toBe(true)
  expect(h.document.querySelector('[role="dialog"]')).toBeNull()
})

test('the DOM facade uses the same visible upload host and fails promptly if it is unavailable', async () => {
  const h = setup()
  vi.stubGlobal('window', h.window)
  const task = webPickAndUploadFile('/upload', 'plugin', 'application/zip')
  expect(h.document.querySelector('[role="dialog"] input')).not.toBeNull()
  h.choose()
  expect(await task).toBe('{"success":1}')
  vi.stubGlobal('window', {})
  await expect(webPickAndUploadFile('/upload', 'plugin', 'application/zip')).rejects.toThrow(
    'file_transfer_unavailable',
  )
})
