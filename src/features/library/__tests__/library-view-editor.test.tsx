import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import {
  DEFAULT_LIBRARY_BROWSE_CONFIG,
  LIBRARY_VIEW_KEYS,
  type LibraryBrowseConfig,
  type LibraryViewKey,
} from '../../../models/library-browse.js'

/**
 * LibraryViewEditor render tests — the in-library "customize views" screen.
 * The drag gesture itself is structurally untestable (the sortable mock lays
 * items out but never drags — AGENTS §6), so reorder is covered at the domain
 * level (`setGroupOrder`); here we cover the group-move buttons, the Switch
 * checked mapping + toggle, the save payload shape, and the two guards
 * (all-hidden blocked, cancel doesn't write).
 */
const { mutateSpy, onCancelSpy, onSavedSpy, webPlatform } = vi.hoisted(() => ({
  mutateSpy: vi.fn(),
  onCancelSpy: vi.fn(),
  onSavedSpy: vi.fn(),
  webPlatform: vi.fn(() => false),
}))

vi.mock('../../../native/web-platform.js', () => ({ isWebPlatform: webPlatform }))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)

vi.mock('@lynx-js/lynx-ui-sortable', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSortable(),
)

vi.mock('../data/library-browse-query.js', () => ({
  useUpdateLibraryBrowseMutation: () => ({
    mutate: mutateSpy,
    isPending: false,
    isError: false,
  }),
}))

const { LibraryViewEditor } = await import('../widgets/LibraryViewEditor.js')

function configOf(
  keys: LibraryViewKey[] = [...LIBRARY_VIEW_KEYS],
  hidden: LibraryViewKey[] = [],
): LibraryBrowseConfig {
  return { views: keys.map((key) => ({ key, visible: !hidden.includes(key) })) }
}

beforeEach(() => {
  mutateSpy.mockClear()
  onCancelSpy.mockClear()
  onSavedSpy.mockClear()
  webPlatform.mockReturnValue(false)
})

afterEach(() => vi.clearAllMocks())

async function renderEditor(config: LibraryBrowseConfig = DEFAULT_LIBRARY_BROWSE_CONFIG) {
  render(<LibraryViewEditor initialConfig={config} onCancel={onCancelSpy} onSaved={onSavedSpy} />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders the three group headers and all 15 view rows', async () => {
  const { queryByText, queryAllByText, queryAllByTestId } = await renderEditor()

  expect(queryByText('Songs')).toBeInTheDocument()
  expect(queryByText('Categories')).toBeInTheDocument()
  // "Playlists" is both a group header and the `playlist_normal` view label.
  expect(queryAllByText('Playlists').length).toBeGreaterThanOrEqual(1)
  // 15 rows → 15 drag handles + 15 switches.
  expect(queryAllByTestId(/^library-editor-drag-/)).toHaveLength(18)
  expect(queryAllByTestId(/^library-editor-switch-/)).toHaveLength(18)
})

test('only drag handles consume native swipes; rows and the page remain scrollable', async () => {
  const { queryAllByTestId } = await renderEditor()
  const handles = queryAllByTestId(/^library-editor-drag-/)
  expect(handles).toHaveLength(18)
  for (const handle of handles) {
    expect(handle).toHaveAttribute('consume-slide-event', JSON.stringify([[-180, 180]]))
  }
  expect(elementTree.root!.querySelectorAll('[consume-slide-event]')).toHaveLength(handles.length)
  expect(elementTree.root!.querySelector('scroll-view')).not.toHaveAttribute(
    'enable-scroll',
    'false',
  )
})

test.each([false, true])(
  'drag handles disable browser panning only on Web (web=%s)',
  async (web) => {
    webPlatform.mockReturnValue(web)
    const { queryAllByTestId } = await renderEditor()
    for (const handle of queryAllByTestId(/^library-editor-drag-/)) {
      expect(handle.style.touchAction ?? '').toBe(web ? 'none' : '')
    }
    expect(
      elementTree.root!.querySelector<HTMLElement>('scroll-view')!.style.touchAction ?? '',
    ).toBe('')
  },
)

test('a hidden view renders its switch unchecked; visible views are checked', async () => {
  const { queryByTestId } = await renderEditor(configOf([...LIBRARY_VIEW_KEYS], ['decade']))

  const hiddenSwitch = queryByTestId('library-editor-switch-decade')!
  expect(hiddenSwitch.querySelector('.app-switch')!.className).not.toContain('ui-checked')
  const visibleSwitch = queryByTestId('library-editor-switch-artist')!
  expect(visibleSwitch.querySelector('.app-switch')!.className).toContain('ui-checked')
})

test('tapping a switch toggles that view and saving reflects it', async () => {
  const { queryByTestId } = await renderEditor()

  const switchWrap = queryByTestId('library-editor-switch-artist')!
  await act(async () => {
    fireEvent.tap(switchWrap.querySelector('.app-switch') as unknown as Element)
  })

  await act(async () => {
    fireEvent.tap(queryByTestId('library-editor-save')!)
  })

  expect(mutateSpy).toHaveBeenCalledTimes(1)
  const saved = mutateSpy.mock.calls[0]![0] as LibraryBrowseConfig
  expect(saved.views.find((v) => v.key === 'artist')?.visible).toBe(false)
  expect(onSavedSpy).toHaveBeenCalled()
})

test('moving a whole group reorders the saved config group-contiguously', async () => {
  const { queryByTestId } = await renderEditor()

  // Move the songs group down one slot → facets become the first group.
  await act(async () => {
    fireEvent.tap(queryByTestId('library-editor-group-down-songs')!)
  })
  await act(async () => {
    fireEvent.tap(queryByTestId('library-editor-save')!)
  })

  const saved = mutateSpy.mock.calls[0]![0] as LibraryBrowseConfig
  expect(saved.views[0]!.key).toBe('folder')
  // Still all 16, still contiguous by group.
  expect(saved.views).toHaveLength(18)
  expect(saved.views.map((v) => v.key)).toEqual([
    'folder',
    'artist',
    'album',
    'genre',
    'year',
    'decade',
    'language',
    'style',
    'tag',
    'all',
    'local',
    'remote',
    'radio',
    'playlist',
    'playlist_normal',
    'playlist_radio',
    'playlist_remote',
    'playlist_local',
  ])
})

test('saving with every view hidden is blocked and does not write', async () => {
  const { queryByTestId, queryByText } = await renderEditor(
    configOf([...LIBRARY_VIEW_KEYS], [...LIBRARY_VIEW_KEYS]),
  )

  await act(async () => {
    fireEvent.tap(queryByTestId('library-editor-save')!)
  })

  expect(mutateSpy).not.toHaveBeenCalled()
  expect(onSavedSpy).not.toHaveBeenCalled()
  expect(queryByText('Keep at least one view visible')).toBeInTheDocument()
})

test('cancel leaves edit mode without writing', async () => {
  const { queryByTestId } = await renderEditor()

  await act(async () => {
    fireEvent.tap(queryByTestId('library-editor-cancel')!)
  })

  expect(mutateSpy).not.toHaveBeenCalled()
  expect(onCancelSpy).toHaveBeenCalled()
})
