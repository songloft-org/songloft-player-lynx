import { useNavigate } from '@tanstack/react-router'

import './pages.css'

/**
 * Chrome-less player placeholder (not wrapped by the shell).
 * The slide-in transition is deferred to a later batch; batch 1 renders plainly.
 */
export function PlayerPage() {
  const navigate = useNavigate()

  return (
    <view className='page page--centered'>
      <text className='page__title'>Now Playing</text>
      <text className='page__subtitle'>Player placeholder</text>
      <view className='page__actions'>
        <view className='pill' bindtap={() => navigate({ to: '/' })}>
          <text className='pill__text'>Back to list</text>
        </view>
      </view>
    </view>
  )
}
