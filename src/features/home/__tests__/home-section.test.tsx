import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { describe, expect, test, vi } from 'vitest'
import { render } from '@lynx-js/react/testing-library'

import type { Playlist } from '../../../models/playlist.js'

/**
 * `HomeSection` receives `isWide` as a prop from `HomePage` (which measures via
 * `useShellSeededBreakpoint`), rather than calling `useBreakpoint()` itself.
 *
 * Before this change, `HomeSection` called `useBreakpoint()` with **no
 * `measureSelector`** — so on Web it never received a width after the first
 * paint (`bindlayoutchange` does not fire for elements mounted later), leaving
 * `isWide` at `false` forever and the grid layout unreachable. The prop makes
 * the layout switch follow `HomePage`'s already-correct measurement.
 *
 * Reverse-verification: with the old `useBreakpoint()` call (no selector, no
 * seed), the wide test would fail — the hook returns `isWide=false` in this env,
 * so the grid never renders.
 */

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

// Keep the test focused on the layout switch, not on PlaylistCard's own tree.
vi.mock('../../playlist/widgets/PlaylistCard.js', () => ({
  PlaylistCard: ({ playlist }: { playlist: Playlist }) =>
    <view data-testid={`card-${playlist.id}`}>{playlist.name}</view>,
}))

const { HomeSection } = await import('../widgets/HomeSection.js')

function makeItems(): Playlist[] {
  return [
    { id: 1, type: 'normal', name: 'A', labels: [], songCount: 3 } as unknown as Playlist,
    { id: 2, type: 'normal', name: 'B', labels: [], songCount: 5 } as unknown as Playlist,
  ]
}

describe('HomeSection layout follows the isWide prop', () => {
  test('wide: renders the grid, not the horizontal scroll', () => {
    const { container } = render(
      <HomeSection
        title='Playlists'
        items={makeItems()}
        onViewAll={() => {}}
        onTapPlaylist={() => {}}
        isWide={true}
      />,
    )
    expect(container.querySelector('.home-section__grid')).not.toBeNull()
    expect(container.querySelector('.home-section__scroll')).toBeNull()
  })

  test('narrow: renders the horizontal scroll, not the grid', () => {
    const { container } = render(
      <HomeSection
        title='Playlists'
        items={makeItems()}
        onViewAll={() => {}}
        onTapPlaylist={() => {}}
        isWide={false}
      />,
    )
    expect(container.querySelector('.home-section__scroll')).not.toBeNull()
    expect(container.querySelector('.home-section__grid')).toBeNull()
  })
})
