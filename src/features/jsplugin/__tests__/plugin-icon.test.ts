import { describe, expect, test, vi } from 'vitest'

import { isSvgIcon } from '../widgets/PluginGrid.js'
import { normalizeSvgMarkup } from '../data/jsplugin-query.js'

/**
 * The home plugin grid rendered nothing where its icons should be. Two facts,
 * both established on an Android emulator:
 *
 *  - 6 of the 7 backend plugin icons are `.svg`, and Lynx's `<image>` renders SVG
 *    on no mobile backend;
 *  - `<svg src={url}>` does not save you: URL loading is delegated to a
 *    host-registered `GenericResourceFetcher`, and this Android host registers
 *    none — logcat showed `getGenericResourceFetcher is null, svg fetch src
 *    failed!` for every icon.
 *
 * So SVG markup is fetched over the authenticated client and passed as
 * `<svg content>`. That also means the response has to be validated: the endpoint
 * SPA-falls-back to `index.html` with a **200** for an unknown path, so a wrong
 * filename yields HTML rather than a 404.
 */
describe('isSvgIcon', () => {
  test('routes by extension, case-insensitively', () => {
    expect(isSvgIcon('icon.27a432e2.svg')).toBe(true)
    expect(isSvgIcon('LOGO.SVG')).toBe(true)
    expect(isSvgIcon('icon.png')).toBe(false)
    expect(isSvgIcon('icon.8933c006.webp')).toBe(false)
  })

  test('ignores a query string and surrounding space', () => {
    expect(isSvgIcon('icon.svg?v=2')).toBe(true)
    expect(isSvgIcon('  icon.svg  ')).toBe(true)
    // A bitmap with `svg` merely in its name must not be routed to `<svg>`.
    expect(isSvgIcon('svg-preview.png')).toBe(false)
  })

  test('missing / empty icons are not SVG (they fall back to the placeholder glyph)', () => {
    expect(isSvgIcon(undefined)).toBe(false)
    expect(isSvgIcon('')).toBe(false)
  })

  /**
   * Registry icons come as `/api/v1/proxy?url=<encoded external URL>` — the
   * path is `/api/v1/proxy` (no `.svg` suffix), and the earlier `split('?')[0]`
   * routed every proxied icon to `<image>`, which cannot render SVG, so the
   * store showed just the plugin's initial. Peel the proxied target out of
   * the query string.
   */
  test('recognises a proxied SVG hidden behind /api/v1/proxy?url=…', () => {
    const encoded = encodeURIComponent(
      'https://raw.githubusercontent.com/songloft-org/songloft-plugin-stats/main/static/icon.svg',
    )
    expect(isSvgIcon(`/api/v1/proxy?url=${encoded}`)).toBe(true)
  })

  test('proxied bitmap URL still routes to <image>', () => {
    const encoded = encodeURIComponent('https://example.com/logo.png')
    expect(isSvgIcon(`/api/v1/proxy?url=${encoded}`)).toBe(false)
  })

  test('proxied URL with its own query string still identifies as SVG', () => {
    const target = encodeURIComponent('https://example.com/icon.svg?v=2')
    expect(isSvgIcon(`/api/v1/proxy?url=${target}`)).toBe(true)
  })
})

/**
 * The 播放统计 plugin (songloft-org/songloft-plugin-stats) ships an `icon.svg`
 * that carries `width="512px" height="512px"` but no `viewBox`. Lynx's Android
 * `<svg content>` renderer paints such an SVG at its intrinsic size, so inside
 * a 32×32 tile only the empty top-left corner is visible and the icon reads
 * as blank. iOS's renderer scales anyway; the bug was Android-only. Fix is to
 * synthesize a `viewBox` from the declared width/height when it is missing.
 */
describe('normalizeSvgMarkup', () => {
  test('injects viewBox derived from width/height when missing', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" width="512px" height="512px"><path/></svg>'
    const out = normalizeSvgMarkup(input)
    expect(out).toContain('viewBox="0 0 512 512"')
    expect(out).toContain('<path/>')
  })

  test('leaves SVGs that already declare viewBox untouched', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256"><g/></svg>'
    expect(normalizeSvgMarkup(input)).toBe(input)
  })

  test('does nothing when width/height cannot be parsed', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>'
    expect(normalizeSvgMarkup(input)).toBe(input)
  })

  test('preserves case of viewBox check (mixed-case attributes)', () => {
    const input = '<svg VIEWBOX="0 0 24 24" width="24" height="24"/>'
    expect(normalizeSvgMarkup(input)).toBe(input)
  })
})

describe('getStaticText', () => {
  function apiWith(body: unknown) {
    const get = vi.fn().mockResolvedValue({ data: body })
    return { get, api: { client: { get } } }
  }

  test('requests the static path as raw text, not JSON', async () => {
    const { get, api } = apiWith('<svg/>')
    const { JSPluginApi } = await import('../api/jsplugin-api.js')
    const instance = new JSPluginApi(api.client as never)

    await instance.getStaticText('lxmusic', 'icon.27a432e2.svg')

    // `parseJson: false` is what keeps SVG markup from being mangled — the same
    // switch `SettingsApi.exportLogs` uses.
    expect(get).toHaveBeenCalledWith(
      '/api/v1/jsplugin/lxmusic/static/icon.27a432e2.svg',
      { parseJson: false },
    )
  })

  test('a non-string body degrades to empty rather than reaching the renderer', async () => {
    const { api } = apiWith({ unexpected: true })
    const { JSPluginApi } = await import('../api/jsplugin-api.js')
    const instance = new JSPluginApi(api.client as never)
    expect(await instance.getStaticText('lxmusic', 'icon.svg')).toBe('')
  })
})
