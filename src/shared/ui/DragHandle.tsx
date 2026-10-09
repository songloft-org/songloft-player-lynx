import type { ReactNode } from '@lynx-js/react'

import { isWebPlatform } from '../../native/web-platform.js'

/** Claim platform swipes while letting touch events reach the parent drag area. */
export function DragHandle({
  className,
  testId,
  disabled = false,
  children,
}: {
  className: string
  testId: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <view
      className={className}
      consume-slide-event={disabled ? undefined : [[-180, 180]]}
      // Native Lynx does not support touch-action; Web needs it before touchstart.
      style={!disabled && isWebPlatform() ? { touchAction: 'none' } : undefined}
      data-testid={testId}
    >
      {children}
    </view>
  )
}
