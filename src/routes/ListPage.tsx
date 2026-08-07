import { useNavigate } from '@tanstack/react-router'

// Imported from the dedicated component package rather than the `@lynx-js/lynx-ui`
// barrel: the barrel eagerly evaluates all ~20 component sub-packages, one of
// which patches Preact's global `options` and corrupts the reconciler under the
// Vitest/ReactLynx test environment. The per-component entry is an officially
// supported package boundary (see lynx-ui foundation docs) and is also lighter.
import { Button } from '@lynx-js/lynx-ui-button'

import './pages.css'

/**
 * Home / song list placeholder (rendered inside the shell).
 *
 * Uses a lynx-ui `Button` (render-prop `active` state) to prove the lynx-ui
 * integration, wired to navigate into the chrome-less player.
 */
export function ListPage() {
  const navigate = useNavigate()

  return (
    <view className='page'>
      <text className='page__title'>Home</text>
      <text className='page__subtitle'>Your songs will appear here</text>
      <view className='page__actions'>
        <Button onClick={() => navigate({ to: '/player' })}>
          {({ active = false }) => (
            <view className={active ? 'luna-button luna-button--active' : 'luna-button'}>
              <text className='luna-button__text'>Open player</text>
            </view>
          )}
        </Button>
        <view className='pill' bindtap={() => navigate({ to: '/login' })}>
          <text className='pill__text'>Log out</text>
        </view>
      </view>
    </view>
  )
}
