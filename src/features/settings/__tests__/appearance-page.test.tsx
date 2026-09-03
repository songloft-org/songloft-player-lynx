import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const { changeLangSpy, changeThemeSpy, navigateSpy } = vi.hoisted(() => ({
  changeLangSpy: vi.fn(async () => 'en' as const),
  changeThemeSpy: vi.fn(async () => 'dark' as const),
  navigateSpy: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))

vi.mock('../../../i18n/index.js', () => ({
  APP_LANGUAGE_OPTIONS: ['system', 'en', 'zh'],
  PREF_LANGUAGE: 'app_language',
  coerceAppLanguage: (raw: unknown) => (raw === 'en' || raw === 'zh' ? raw : 'system'),
  changeAppLanguage: changeLangSpy,
}))
vi.mock('../../../shared/theme/material-model.js', () => ({
  MATERIAL_VARIANT_OPTIONS: ['ultra-thin', 'thin', 'regular', 'thick'],
  PREF_MATERIAL: 'glass_material',
  coerceMaterialVariant: (raw: unknown) =>
    raw === 'ultra-thin' || raw === 'thin' || raw === 'regular' || raw === 'thick' ? raw : 'regular',
  getMaterialVariant: () => 'regular',
  changeMaterialVariant: vi.fn(async () => 'regular'),
}))
vi.mock('../../../shared/theme/theme-model.js', () => ({
  APP_THEME_OPTIONS: ['system', 'light', 'dark'],
  PREF_THEME: 'app_theme',
  coerceAppTheme: (raw: unknown) => (raw === 'light' || raw === 'dark' ? raw : 'system'),
  getAppTheme: () => 'dark',
  // Not used by this page, but ThemeProvider sits in the transitive import graph
  // and reads it — omitting it makes the whole module mock throw.
  resolveTheme: (app: string) => (app === 'system' ? 'dark' : app),
  changeAppTheme: changeThemeSpy,
}))

// The appearance page also hosts the theme-pack card (the former
// `/settings/theme-packs` page). It fetches on mount, so both halves stand in
// for inert stubs — the card's own behaviour is covered by
// `theme-packs-section.test.tsx`.
vi.mock('../../../shared/theme/theme-pack-model.js', () => ({
  activateThemePack: vi.fn(async () => {}),
  applyActiveThemePack: vi.fn(async () => {}),
  clearActiveThemePack: vi.fn(async () => {}),
  getActiveThemePack: () => null,
  subscribeActiveThemePack: () => () => {},
}))
vi.mock('../api/index.js', () => ({
  getThemePacksApi: () => ({
    list: vi.fn(async () => []),
    deletePack: vi.fn(async () => {}),
    refreshCatalog: vi.fn(async () => []),
    installFromCatalog: vi.fn(async () => {}),
  }),
}))

const { AppearancePage } = await import('../pages/AppearancePage.js')

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<AppearancePage />)
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

test('renders the theme and language option rows', async () => {
  const { queryByTestId, queryAllByTestId } = await renderPage()

  for (const id of ['theme-system', 'theme-light', 'theme-dark']) {
    expect(queryByTestId(id), id).toBeInTheDocument()
  }
  for (const id of ['language-system', 'language-en', 'language-zh']) {
    expect(queryByTestId(id), id).toBeInTheDocument()
  }

  // Exactly one tick per group — the persisted defaults (system / system). The
  // theme-pack card adds none: with no installed packs it renders its empty
  // state, and the catalog entry row carries a chevron, not a check.
  expect(queryAllByTestId('icon-check')).toHaveLength(3)
})

test('hosts the theme-pack card with its catalog entry row', async () => {
  const { queryByTestId } = await renderPage()

  expect(queryByTestId('theme-packs-catalog-open')).toBeInTheDocument()
})

test('tapping the store entry routes to the catalog page when no pane callback is given', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('theme-packs-catalog-open')!) })

  // Standalone route (single-column): the store is a page, so the entry falls
  // back to routing. In the wide pane, `onOpenCatalog` swaps the pane instead.
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings/theme-catalog' })
})

test('selecting a theme applies + persists it via changeAppTheme', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('theme-light')!) })

  expect(changeThemeSpy).toHaveBeenCalledWith('light')
})

test('selecting a language applies + persists it via changeAppLanguage', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('language-zh')!) })

  expect(changeLangSpy).toHaveBeenCalledWith('zh')
})
