import { hostAssetUrl } from '../../core/config/app-config.js'
import './SplashScreen.css'

/**
 * Neutral launch placeholder shown while auth is unresolved or a guard
 * redirect is still in flight — see `RootRouteView` in `router.tsx` and
 * `isAuthTransitionPending` in `features/auth/store/guard.ts`.
 *
 * Deliberately static: no animation, no progress UI, no copy. It exists only
 * so the first *content* frame is a real destination instead of whichever
 * route a cold-starting app happens to boot on (memory history boots at
 * `/login`; it cannot read the browser URL). The background comes from
 * `.theme-root` (`--canvas`), so the splash reads as "still launching" in both
 * themes.
 */
export function SplashScreen() {
  return (
    <view className='splash' data-testid='splash'>
      <image className='splash__logo' src={hostAssetUrl('app_icon.png')} mode='aspectFit' />
    </view>
  )
}
