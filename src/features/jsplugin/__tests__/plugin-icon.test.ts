import { describe, expect, test, vi } from 'vitest'

import { isSvgIcon } from '../widgets/PluginGrid.js'

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
