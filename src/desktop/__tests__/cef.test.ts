import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { DESKTOP_CEF_BRIDGE, desktopCefInit } from '../cef.js'

describe('CEF document bridge', () => {
  it('holds hidden timers, supports cancellation, and resumes pending timeouts once', () => {
    let id = 0,
      calls = 0
    const tasks = new Map<number, () => void>()
    const window: Record<string, any> = {
      setTimeout(fn: () => void) {
        tasks.set(++id, fn)
        return id
      },
      setInterval(fn: () => void) {
        tasks.set(++id, fn)
        return id
      },
      clearTimeout(value: number) {
        tasks.delete(value)
      },
    }
    const document = { dispatchEvent() {} }
    runInNewContext(DESKTOP_CEF_BRIDGE, { window, document, Event: class {} })
    window.__songloftSetVisible(false)
    const cancelled = window.setTimeout(() => calls++)
    window.clearInterval(cancelled)
    window.setTimeout(() => calls++)
    window.setInterval(() => (calls += 10))
    for (const task of tasks.values()) task()
    expect(calls).toBe(0)
    expect((document as any).hidden).toBe(true)
    window.__songloftSetVisible(true)
    expect(calls).toBe(1)
    window.__songloftSetVisible(true)
    expect(calls).toBe(1)
  })
  it('keeps in-plugin navigation and sends external links through the existing browser bridge', () => {
    let click: (event: any) => void = () => {}
    let registrations = 0
    const messages: string[] = []
    const window = {
      setTimeout,
      setInterval,
      clearTimeout,
      cefQuery: ({ request }: { request: string }) => messages.push(request),
    }
    const document = {
      addEventListener: (_name: string, callback: typeof click) => {
        registrations++
        click = callback
      },
      dispatchEvent() {},
    }
    const script = desktopCefInit(
      'https://server.test/sub/api/v1/jsplugin/example/?access_token=fixture',
    )
    const browser = { window, document, Event: class {}, URL }
    runInNewContext(script, {
      ...browser,
      location: { href: 'https://outside.test/' },
    })
    expect(registrations).toBe(0)
    const location = {
      href: 'https://server.test/sub/api/v1/jsplugin/example/',
    }
    runInNewContext(script, { ...browser, location })
    runInNewContext(script, { ...browser, location })
    expect(registrations).toBe(1)
    let prevented = false
    const event = (href: string) => ({
      target: { closest: () => ({ href }) },
      preventDefault: () => {
        prevented = true
      },
    })
    click(event('https://server.test/sub/api/v1/jsplugin/example/settings'))
    expect(messages).toHaveLength(0)
    expect(prevented).toBe(false)
    click(event('https://outside.test/page'))
    expect(prevented).toBe(true)
    expect(messages).toEqual([
      'LyNxSig_' +
        JSON.stringify({
          type: 'songloft-desktop-external',
          url: 'https://outside.test/page',
        }),
    ])
  })
})
