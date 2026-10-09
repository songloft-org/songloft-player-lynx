import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string; runScripts: string }) => {
    window: Window & typeof globalThis & { eval: (source: string) => void }
  }
}
const html = readFileSync(resolve(__dirname, '../../web/index.html'), 'utf8')

test.each(['/', '/songloft/', '/nested/音乐/index.html?preview=1#player'])(
  'the host resolves resources and pre-upgrade global props at %s', path => {
    const pageUrl = new URL(path, 'https://music.example')
    const base = new URL('.', pageUrl)
    for (const embedded of [false, true]) {
      const source = embedded ? html.replace(`global-props='{"deployMode":"standalone"}'`, '') : html
      const dom = new JSDOM(source, { url: pageUrl.href, runScripts: 'outside-only' })
      dom.window.matchMedia = (query: string) => ({ matches: false }) as MediaQueryList
      Object.defineProperty(dom.window, 'CSS', { value: { supports: () => true } })
      try {
        const document = dom.window.document
        const bootstrap = document.querySelector('script[data-songloft-deployment]')
        expect(bootstrap, 'deployment props must arrive before web-core upgrades the view').not.toBeNull()
        dom.window.eval(bootstrap!.textContent!)
        const app = document.getElementById('app')!
        expect(app.getAttribute('url')).toBe(new URL('main.lynx.bundle', base).href)
        expect(JSON.parse(app.getAttribute('global-props')!)).toEqual({
          ...(embedded ? {} : { deployMode: 'standalone' }), webBaseUrl: base.href,
          systemTheme: 'light', systemLocale: 'en-US', systemReduceMotion: false,
          systemReduceTransparency: false, systemIncreaseContrast: false, backdropBlurSupported: true,
          webTabGlassSupported: false,
        })
        for (const element of document.querySelectorAll('script[src], link[href]')) {
          const raw = element.getAttribute('src') ?? element.getAttribute('href')!
          expect(new URL(raw, document.baseURI).pathname).toMatch(new RegExp(`^${base.pathname}`))
        }
      } finally { dom.window.close() }
    }
  },
)
