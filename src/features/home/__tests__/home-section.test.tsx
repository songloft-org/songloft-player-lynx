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
// Captures `onPlayAll` so the play-button wiring is assertable without rendering
// the real card.
vi.mock('../../playlist/widgets/PlaylistCard.js', () => ({
  PlaylistCard: ({ playlist, onPlayAll }: { playlist: Playlist; onPlayAll?: (p: Playlist) => void }) =>
    <view data-testid={`card-${playlist.id}`} data-play={onPlayAll ? '1' : '0'}>{playlist.name}</view>,
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

describe('HomeSection play-button wiring', () => {
  test('forwards onPlayAll to each card when provided', () => {
    const { container } = render(
      <HomeSection
        title='Playlists'
        items={makeItems()}
        onViewAll={() => {}}
        onTapPlaylist={() => {}}
        onPlayAll={() => {}}
        isWide={false}
      />,
    )
    expect(container.querySelector('[data-play="1"]')).not.toBeNull()
  })

  test('omits the play affordance when onPlayAll is not provided', () => {
    const { container } = render(
      <HomeSection
        title='Playlists'
        items={makeItems()}
        onViewAll={() => {}}
        onTapPlaylist={() => {}}
        isWide={false}
      />,
    )
    expect(container.querySelector('[data-play="1"]')).toBeNull()
  })
})

describe('HomeSection empty state', () => {
  test('shows the empty title + CTA when items are empty, not failed, not loading', () => {
    const onEmptyAction = vi.fn()
    const { container } = render(
      <HomeSection
        title='Playlists'
        items={[]}
        onViewAll={() => {}}
        onTapPlaylist={() => {}}
        isWide={false}
        emptyTitle='No playlists yet'
        emptyActionLabel='Create playlist'
        onEmptyAction={onEmptyAction}
      />,
    )
    expect(container.querySelector('.home-section__empty')).not.toBeNull()
    const action = container.querySelector('.home-section__empty-action')
    expect(action).not.toBeNull()
    // The CTA is an accent pill, not the neutral retry fill — empty ≠ error.
    expect(container.querySelector('.home-section__error')).toBeNull()
  })

  test('renders no body while empty and still loading (no premature empty state)', () => {
    const { container } = render(
      <HomeSection
        title='Playlists'
        items={[]}
        loading={true}
        onViewAll={() => {}}
        onTapPlaylist={() => {}}
        isWide={false}
        emptyTitle='No playlists yet'
        emptyActionLabel='Create playlist'
        onEmptyAction={() => {}}
      />,
    )
    expect(container.querySelector('.home-section__empty')).toBeNull()
    expect(container.querySelector('.home-section__scroll')).toBeNull()
    expect(container.querySelector('.home-section__grid')).toBeNull()
  })

  test('shows text-only empty (no CTA) when onEmptyAction is omitted', () => {
    const { container } = render(
      <HomeSection
        title='Radios'
        items={[]}
        onViewAll={() => {}}
        onTapPlaylist={() => {}}
        isWide={false}
        emptyTitle='No radios yet'
      />,
    )
    expect(container.querySelector('.home-section__empty')).not.toBeNull()
    expect(container.querySelector('.home-section__empty-action')).toBeNull()
  })
})
