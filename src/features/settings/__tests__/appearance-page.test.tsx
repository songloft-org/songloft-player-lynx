import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const { changeLangSpy, changeThemeSpy } = vi.hoisted(() => ({
  changeLangSpy: vi.fn(async () => 'en' as const),
  changeThemeSpy: vi.fn(async () => 'dark' as const),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

vi.mock('../../../i18n/index.js', () => ({
  APP_LANGUAGE_OPTIONS: ['system', 'en', 'zh'],
  PREF_LANGUAGE: 'app_language',
  coerceAppLanguage: (raw: unknown) => (raw === 'en' || raw === 'zh' ? raw : 'system'),
  changeAppLanguage: changeLangSpy,
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

  // Exactly one tick per group — the persisted defaults (system / system).
  expect(queryAllByTestId('icon-check')).toHaveLength(2)
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
