export interface ProgressBarProps {
  /**
   * 0-100 for a determinate bar, or `null` for indeterminate (the server is
   * working but has not reported a countable total yet).
   */
  value: number | null
  testId?: string
}

/**
 * Determinate / indeterminate progress bar.
 *
 * Lynx has no indeterminate progress primitive, so the indeterminate state is a
 * fixed-width fill translated across the track by an infinite CSS keyframe
 * animation (`animation` is available on android/ios/harmony/clay/web_lynx). If
 * a backend ever ignores the animation the fill simply sits at 30% — still
 * visibly distinct from a 0% determinate bar, never a blank or broken state.
 *
 * The determinate track/fill geometry is the same 2px pair used by
 * `player/widgets/MiniPlayer.css`.
 *
 * Tests assert the `--indeterminate` class rather than the animation: the phase
 * → bar-shape decision is what carries logic, and Vitest applies no CSS.
 */
export function ProgressBar({ value, testId }: ProgressBarProps) {
  const indeterminate = value === null
  const fillClass = indeterminate
    ? 'libops-progress__fill libops-progress__fill--indeterminate'
    : 'libops-progress__fill'

  return (
    <view className='libops-progress' data-testid={testId}>
      <view
        className={fillClass}
        style={indeterminate ? undefined : { width: `${value}%` }}
      />
    </view>
  )
}
