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

test.each([
  ['Mozilla/5.0 Firefox/134.0', true, false],
  ['Mozilla/5.0 Firefox/133.0', false, false],
  ['Mozilla/5.0 Version/18.2 Safari/605.1.15', true, false],
  ['Mozilla/5.0 Version/18.1 Safari/605.1.15', false, false],
  ['Mozilla/5.0 Version/26.0 Safari/605.1.15', true, false],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/141.0 Mobile Safari/604.1', true, false],
  ['Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 FxiOS/141.0 Mobile Safari/605.1.15', true, false],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 CriOS/141.0 Mobile Safari/604.1', false, false],
  ['Mozilla/5.0 Chrome/153.0 Safari/537.36', false, true],
])('glass selects a verified optical backend for %s', (userAgent, scene, backdrop) => {
  const dom = new JSDOM(html, { url: 'https://music.example/', runScripts: 'outside-only' })
  dom.window.matchMedia = () => ({ matches: false }) as MediaQueryList
  Object.defineProperty(dom.window.navigator, 'userAgent', { value: userAgent })
  Object.defineProperty(dom.window, 'CSS', { value: { supports: () => true } })
  try {
    dom.window.eval(dom.window.document.querySelector('script[data-songloft-deployment]')!.textContent!)
    const props = JSON.parse(dom.window.document.getElementById('app')!.getAttribute('global-props')!)
    expect(props.webGlassSceneSupported).toBe(scene)
    expect(props.webTabGlassSupported).toBe(backdrop)
    expect(props.webGlassSupported).toBe(scene || backdrop)
  } finally { dom.window.close() }
})

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
          webGlassSceneSupported: false,
          webGlassSupported: false,
        })
        for (const element of document.querySelectorAll('script[src], link[href]')) {
          const raw = element.getAttribute('src') ?? element.getAttribute('href')!
          expect(new URL(raw, document.baseURI).pathname).toMatch(new RegExp(`^${base.pathname}`))
        }
      } finally { dom.window.close() }
    }
  },
)
