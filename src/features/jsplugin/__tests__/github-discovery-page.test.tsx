import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import type { ReactNode } from '@lynx-js/react'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { beforeEach, expect, test, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { parseJSPlugin } from '../../../models/jsplugin.js'
import { en } from '../../../i18n/resources.js'
import type { GithubPlugin } from '../domain/github-plugin-validation.js'
import { installBackRouter } from '../../../__tests__/_render-mocks.js'

const h = vi.hoisted(() => ({
  plugins: [] as GithubPlugin[], installed: [] as unknown[], host: '2.10.0', install: vi.fn(), openURL: vi.fn(),
  error: null as unknown, pending: false, more: false, fetchMore: vi.fn(), failures: {} as Record<string, number>,
  token: '', tokenInput: 'ghp_new', revision: 0, saveToken: vi.fn(), tokenError: false, tokenRetry: vi.fn(),
  discoveryInput: null as null | { token: string; enabled: boolean },
}))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('@lynx-js/lynx-ui-input', () => ({ Input: ({ id, value, type, onInput }: { id?: string; value?: string; type?: string; onInput?: (v: string) => void }) =>
  <view data-testid={id} data-value={value} data-type={type} bindtap={() => onInput?.(h.tokenInput)} /> }))
vi.mock('../../../native/native-platform.js', () => ({ openURL: h.openURL }))
vi.mock('../data/jsplugin-query.js', async importOriginal => ({
  ...await importOriginal<typeof import('../data/jsplugin-query.js')>(),
  useGithubProxyQuery: () => ({ data: '', isPending: false }),
  usePluginsQuery: () => ({ data: { plugins: h.installed }, isSuccess: true, refetch: vi.fn() }),
}))
vi.mock('../data/jsplugin-mutations.js', () => ({ useInstallFromRegistryMutation: () => ({ mutate: h.install, isPending: false }) }))
vi.mock('../data/github-discovery-token-query.js', () => ({ useGithubDiscoveryTokenQuery: () => ({
  data: h.token, isSuccess: !h.tokenError, isFetching: false, isError: h.tokenError, credentialRevision: h.revision,
  refetch: h.tokenRetry, save: { mutateAsync: h.saveToken },
}) }))
vi.mock('../data/github-discovery-query.js', () => ({
  useDiscoveryHostVersion: () => ({ data: h.host, refetch: vi.fn() }),
  discoveryErrorKey: () => 'githubDiscovery.loadFailed',
  useGithubDiscoveryQuery: (input: { token: string; enabled: boolean }) => { h.discoveryInput = input; return ({
    data: { pages: [{ plugins: h.plugins, checked: 3, failures: h.failures }] },
    isPending: h.pending, isFetching: h.pending, isFetchingNextPage: false,
    isError: h.error != null, error: h.error, hasNextPage: h.more, fetchNextPage: h.fetchMore,
  }) },
}))
vi.mock('@lynx-js/lynx-ui-dialog', () => ({
  DialogRoot: ({ children, show }: { children: ReactNode; show: boolean }) => <view data-dialoghidden={show ? 'false' : 'true'}>{children}</view>,
  DialogView: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogBackdrop: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogContent: ({ children }: { children: ReactNode }) => <view>{children}</view>,
}))
const { GithubDiscoveryPage } = await import('../pages/GithubDiscoveryPage.js')
const { fetchDiscoverySvg } = await import('../widgets/GithubDiscoveryIcon.js')
const plugin: GithubPlugin = {
  repository: { id: 1, fullName: 'alice/music', defaultBranch: 'main', stars: 12, updatedAt: '' },
  manifest: { name: '音乐插件', description: '听音乐', version: '1.0.0', author: 'Alice', homepage: '', minHostVersion: '2.9.5',
    entryPath: 'music', main: 'main.js', renderEngine: 'lynx', permissions: ['songs.read'], updateUrl: '', download_url: '', entryHash: 'a'.repeat(64), zipHash: 'b'.repeat(64) },
  downloadUrl: 'https://github.com/alice/music/releases/download/v1.0.0/music.jsplugin.zip',
  releaseUrl: 'https://github.com/alice/music/releases/tag/v1.0.0', publishedAt: '2026-10-08T00:00:00Z',
}
beforeEach(() => {
  vi.clearAllMocks()
  h.plugins = [plugin]; h.installed = []; h.host = '2.10.0'; h.error = null; h.pending = false; h.more = false; h.failures = {}
  h.token = ''; h.revision = 0; h.tokenError = false; h.discoveryInput = null
  h.saveToken.mockImplementation(async (token: string) => { h.token = token; h.revision++ })
})
async function page(props: { onBack?: () => void } = {}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GithubDiscoveryPage {...props} />
    </QueryClientProvider>,
  )
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

test('uses the same repository icon in the list and beside the detail title', async () => {
  h.plugins = [{ ...plugin, manifest: { ...plugin.manifest, icon: 'assets/icon.png' } }]
  const q = await page()
  const icon = q.getByTestId('github-plugin-icon')
  const image = icon.querySelector('.plugin-icon-tile__img')
  expect(image).toHaveAttribute('src', 'https://raw.githubusercontent.com/alice/music/main/assets/icon.png')
  expect(icon.textContent).toBe('音')
  await tap('github-plugin-1')
  expect(q.getAllByTestId('github-plugin-icon')).toHaveLength(2)
  expect(q.getAllByTestId('github-plugin-icon').map(tile => tile.querySelector('.plugin-icon-tile__img')?.getAttribute('src')))
    .toEqual([image?.getAttribute('src'), image?.getAttribute('src')])
})

test('native SVG loading retries a failed proxy anonymously and falls back after a non-image response', async () => {
  const direct = 'https://raw.githubusercontent.com/alice/music/main/static/icon.svg'
  const proxy = `https://proxy.example/${direct}`
  const signal = new AbortController().signal
  const transport = vi.fn()
    .mockResolvedValueOnce({ status: 404, body: 'missing' })
    .mockResolvedValueOnce({ status: 200, body: '<svg width="20" height="16"></svg>' })
    .mockResolvedValueOnce({ status: 200, body: '<html>not an image</html>' })
  expect(await fetchDiscoverySvg([proxy, direct], signal, transport)).toContain('viewBox="0 0 20 16"')
  expect(transport.mock.calls.map(([request]) => [request.url, request.headers])).toEqual([[proxy, {}], [direct, {}]])
  expect(await fetchDiscoverySvg([direct], signal, transport)).toBe('')
})
async function tap(id: string) {
  await act(async () => { fireEvent.tap(getQueriesForElement(elementTree.root!).getByTestId(id)) })
}

test('token entry hides input, saves to the server, and refreshes client discovery', async () => {
  await page()
  await tap('github-discovery-token')
  const q = getQueriesForElement(elementTree.root!)
  expect(q.getByTestId('github-token-input')).toHaveAttribute('data-type', 'password')
  await tap('github-token-input')
  await tap('github-token-save')
  expect(h.saveToken).toHaveBeenCalledWith('ghp_new')
  expect(h.discoveryInput?.token).toBe('ghp_new')
  await tap('github-discovery-token')
  expect(q.getByTestId('github-token-input')).toHaveAttribute('data-value', '')
  await tap('github-token-clear')
  expect(h.saveToken).toHaveBeenLastCalledWith('')
  expect(h.discoveryInput?.token).toBe('')
})

test('cancel and failed token saves preserve the existing server token', async () => {
  h.token = 'ghp_existing'
  await page()
  await tap('github-discovery-token')
  await tap('github-token-input')
  await tap('github-token-cancel')
  expect(h.saveToken).not.toHaveBeenCalled()
  await tap('github-discovery-token')
  await tap('github-token-input')
  h.saveToken.mockRejectedValueOnce(new Error('failed'))
  await tap('github-token-save')
  expect(h.token).toBe('ghp_existing')
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-token-dialog').textContent).toContain(en.githubDiscovery.tokenSaveFailed)
})

test('server token read failure blocks GitHub requests and offers retry', async () => {
  h.tokenError = true
  await page()
  expect(h.discoveryInput?.enabled).toBe(false)
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-token-load-error')).toBeInTheDocument()
  await tap('github-token-load-error')
  expect(h.tokenRetry).toHaveBeenCalled()
})

test('opens details and requires explicit unreviewed/permissions confirmation before installation', async () => {
  await page()
  await tap('github-plugin-1')
  const queries = getQueriesForElement(elementTree.root!)
  expect(queries.getByTestId('github-plugin-detail').textContent).toContain('songs.read')
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
  expect(queries.getByTestId('github-install-dialog').textContent).toContain('alice/music')
  await tap('github-install-confirm')
  expect(h.install).toHaveBeenCalledWith({ downloadUrl: plugin.downloadUrl, githubProxy: undefined, overwrite: false }, expect.anything())
})

test('an occupied entryPath explicitly warns and only overwrites after confirmation', async () => {
  h.installed = [parseJSPlugin({ id: 3, name: 'Existing music', entry_path: 'music', author: 'Alice', version: '0.9.0' })]
  await page()
  await tap('github-plugin-1')
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-plugin-detail').textContent).toContain('Existing music')
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
  await tap('github-install-confirm')
  expect(h.install).toHaveBeenCalledWith(expect.objectContaining({ overwrite: true }), expect.anything())
})

test('an already-installed matching repository/version is shown as installed', async () => {
  h.installed = [parseJSPlugin({ id: 3, name: plugin.manifest.name, entry_path: 'music', version: '1.0.0', update_url: 'https://raw.githubusercontent.com/alice/music/main/plugin.json' })]
  await page()
  await tap('github-plugin-1')
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-plugin-install').textContent).toBe(en.githubDiscovery.installed)
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
})

test('four-part plugin release shows an update and installs its matching package', async () => {
  const downloadUrl = 'https://github.com/alice/music/releases/download/v2026.10.15.1/music.jsplugin.zip'
  h.plugins = [{ ...plugin, downloadUrl, manifest: { ...plugin.manifest, version: '2026.10.15.1' } }]
  h.installed = [parseJSPlugin({ id: 3, name: plugin.manifest.name, entry_path: 'music', version: '2026.10.15', update_url: 'https://raw.githubusercontent.com/alice/music/main/plugin.json' })]
  await page()
  await tap('github-plugin-1')
  const text = getQueriesForElement(elementTree.root!).getByTestId('github-plugin-install').textContent
  expect(text).toContain('2026.10.15.1')
  expect(text).toContain('Update')
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
  await tap('github-install-confirm')
  expect(h.install).toHaveBeenCalledWith({ downloadUrl, githubProxy: undefined, overwrite: true }, expect.anything())
})

test('dev server skips minimum-version checks but still requires installation confirmation', async () => {
  h.host = 'dev'
  h.plugins = [{ ...plugin, manifest: { ...plugin.manifest, minHostVersion: '999.0.0' } }]
  await page()
  await tap('github-plugin-1')
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
  await tap('github-install-confirm')
  expect(h.install).toHaveBeenCalledTimes(1)
})

test.each(['2.9.4', 'unknown'])('blocks installing when host compatibility is insufficient or unknown (%s)', async version => {
  h.host = version
  await page()
  await tap('github-plugin-1')
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
  const dialog = getQueriesForElement(elementTree.root!).getByTestId('github-install-dialog')
  expect(dialog.closest('[data-dialoghidden]')?.getAttribute('data-dialoghidden')).toBe('true')
})

test('detail return preserves the original list instead of navigating away', async () => {
  const onBack = vi.fn()
  await page({ onBack })
  await tap('github-plugin-1')
  await tap('github-discovery-back')
  expect(onBack).not.toHaveBeenCalled()
  expect(getQueriesForElement(elementTree.root!).queryByTestId('github-plugin-detail')).toBeNull()
  await tap('github-discovery-back')
  expect(onBack).toHaveBeenCalledOnce()
})

test('standalone back returns to the store', async () => {
  const navigate = installBackRouter('/settings/plugins/registry/github')
  await page()
  await tap('github-discovery-back')
  expect(navigate).toHaveBeenCalledWith({ to: '/settings/plugins/registry' })
})

test('source and release links use the host URL bridge', async () => {
  await page()
  await tap('github-plugin-1')
  await tap('github-plugin-source')
  await tap('github-plugin-release')
  expect(h.openURL.mock.calls).toEqual([['https://github.com/alice/music'], [plugin.releaseUrl]])
})

test('an append failure keeps validated plugins and offers retry', async () => {
  h.error = new Error('offline')
  await page()
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-plugin-1')).toBeInTheDocument()
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-discovery-retry')).toBeInTheDocument()
})

test('network failures are shown as pending verification rather than an empty catalog', async () => {
  h.plugins = []; h.failures = { unavailable: 3 }
  await page()
  expect(elementTree.root!.textContent).toContain(en.githubDiscovery.pending)
  expect(elementTree.root!.textContent).not.toContain(en.githubDiscovery.empty)
})
