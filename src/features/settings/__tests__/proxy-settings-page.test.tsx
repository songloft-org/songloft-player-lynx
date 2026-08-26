import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * ProxySettingsPage tests.
 *
 * The page used to load its four settings with raw `fetch` inside an effect, and
 * that loading gate never flushed in the ReactLynx harness — so it had NO render
 * test (only the `AI_PROMPT` content assertions below). It now goes through the
 * api + query layer, which mocks cleanly, so the render tests at the bottom assert
 * the very thing that was previously untestable: the loading gate flushes and the
 * save flow fires the mutation.
 */

const mockProxyData = {
  httpProxy: 'http://proxy.example:8080',
  githubProxy: 'https://gh.example/',
  hlsEnabled: true,
  allowlist: ['192.168.1.0/24', '10.0.0.1'],
}
const saveMutateSpy = vi.fn()

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
// The shared `mockLynxUiInput` only stands in `Input`; this page also uses
// `TextArea` (the allowlist field), so provide both here.
vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: ({ className, placeholder }: { className?: string; placeholder?: string }) => (
    <view className={className}><text>{placeholder}</text></view>
  ),
  TextArea: ({ className, placeholder }: { className?: string; placeholder?: string }) => (
    <view className={className}><text>{placeholder}</text></view>
  ),
}))
vi.mock('../data/proxy-query.js', () => ({
  proxyQueryKeys: { all: () => ['settings', 'proxy'] as const },
  useProxySettingsQuery: () => ({ data: mockProxyData, isLoading: false }),
}))
vi.mock('../data/proxy-mutations.js', () => ({
  useSaveProxySettingsMutation: () => ({ mutate: saveMutateSpy, isPending: false }),
}))

const { AI_PROMPT, ProxySettingsPage } = await import('../pages/ProxySettingsPage.js')

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<ProxySettingsPage />)
  // Flush the draft-seeding effect so the form (not the loading gate) is showing.
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

// ── Render tests (previously impossible — see file header) ───────────────────

test('the loading gate flushes and the form renders', async () => {
  const { queryByTestId } = await renderPage()
  // The save button only exists in the form branch, past the loading gate.
  expect(queryByTestId('proxy-save')).toBeInTheDocument()
  // The GitHub-proxy AI-prompt affordance is part of the form.
  expect(queryByTestId('github-copy-prompt')).toBeInTheDocument()
})

test('save PUTs all four settings, splitting the allowlist text into entries', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('proxy-save')!) })

  expect(saveMutateSpy).toHaveBeenCalledTimes(1)
  // The draft was seeded from the query data; the multi-line allowlist text is
  // split back into entries before it reaches the API.
  expect(saveMutateSpy.mock.calls[0][0]).toEqual({
    httpProxy: mockProxyData.httpProxy,
    githubProxy: mockProxyData.githubProxy,
    hlsEnabled: mockProxyData.hlsEnabled,
    allowlist: ['192.168.1.0/24', '10.0.0.1'],
  })
})

// ── AI prompt affordance ─────────────────────────────────────────────────────

test('the prompt asks for the things that make an answer usable', () => {
  // Ported verbatim from `github_proxy_dialog.dart`; these are the constraints
  // that separate a usable answer from a list of dead domains.
  expect(AI_PROMPT).toContain('raw.githubusercontent.com')
  expect(AI_PROMPT).toContain('github.com')
  // The shape the field actually needs: a prefix you concatenate, not an API.
  expect(AI_PROMPT).toContain('https://')
  expect(AI_PROMPT).toContain('免费')
})

test('copyToClipboard hands the text to the platform module', async () => {
  const setClipboard = vi.fn()
  const mods = { SongloftPlatform: { openURL: () => {}, setClipboard } }
  vi.stubGlobal('NativeModules', mods)

  const { copyToClipboard } = await import('../../../native/native-platform.js')
  copyToClipboard(AI_PROMPT)

  expect(setClipboard).toHaveBeenCalledWith(AI_PROMPT)
  vi.unstubAllGlobals()
  vi.resetModules()
})
