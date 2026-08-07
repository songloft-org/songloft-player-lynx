import { useNavigate } from '@tanstack/react-router'

import './pages.css'

/**
 * Chrome-less login placeholder (not wrapped by the shell).
 * Batch 1: a single action that navigates into the app shell.
 */
export function LoginPage() {
  const navigate = useNavigate()

  return (
    <view className='page page--centered'>
      <text className='page__title'>Songloft</text>
      <text className='page__subtitle'>Sign in to continue</text>
      <view className='page__actions'>
        <view className='pill' bindtap={() => navigate({ to: '/' })}>
          <text className='pill__text'>Log in</text>
        </view>
      </view>
    </view>
  )
}
