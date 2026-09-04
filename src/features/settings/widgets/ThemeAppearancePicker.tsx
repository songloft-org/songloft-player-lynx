import type { AppTheme } from '../../../shared/theme/theme-model.js'
import './ThemeAppearancePicker.css'

export interface ThemeAppearancePickerProps {
  options: readonly AppTheme[]
  selected: AppTheme
  onSelect: (theme: AppTheme) => void
  labelFor: (theme: AppTheme) => string
  testId?: string
}

/**
 * Mini phone-style preview for ONE concrete appearance ('light' or 'dark'): a
 * page background carrying a raised card with two text lines. Purely
 * decorative, so the palette literals are Apple's own light/dark values
 * hard-coded — a preview must keep showing "light" even while the app runs
 * dark, which rules out live tokens here.
 */
function Preview({ kind }: { kind: 'light' | 'dark' }) {
  const light = kind === 'light'
  return (
    <view
      className='theme-tile__half'
      style={{ backgroundColor: light ? '#ffffff' : '#000000' }}
    >
      <view
        className='theme-tile__card'
        style={{ backgroundColor: light ? '#f2f2f7' : '#1c1c1e' }}
      >
        <view
          className='theme-tile__line'
          style={{ backgroundColor: light ? 'rgba(60,60,67,0.35)' : 'rgba(235,235,245,0.35)' }}
        />
        <view
          className='theme-tile__line theme-tile__line--short'
          style={{ backgroundColor: light ? 'rgba(60,60,67,0.2)' : 'rgba(235,235,245,0.2)' }}
        />
      </view>
    </view>
  )
}

/**
 * iOS-style appearance picker — the "Light / Dark" preview tiles from Settings ▸
 * Display & Brightness, replacing the former checkmark rows. Each choice is a
 * small phone-style preview card with its label; the selected one gets an accent
 * ring + a check badge. 'system' renders a split (half light / half dark) tile.
 */
export function ThemeAppearancePicker({
  options,
  selected,
  onSelect,
  labelFor,
  testId,
}: ThemeAppearancePickerProps) {
  return (
    <view className='theme-picker' data-testid={testId}>
      {options.map((opt) => {
        const active = opt === selected
        return (
          <view
            key={opt}
            className={active ? 'theme-tile theme-tile--selected' : 'theme-tile'}
            bindtap={() => onSelect(opt)}
            data-testid={testId ? `${testId}-${opt}` : undefined}
          >
            <view className='theme-tile__preview'>
              {opt === 'system'
                ? (
                  <>
                    <Preview kind='light' />
                    <Preview kind='dark' />
                  </>
                )
                : <Preview kind={opt === 'dark' ? 'dark' : 'light'} />}
            </view>
            {active ? (
              <view className='theme-tile__check'>
                <text className='theme-tile__check-glyph'>✓</text>
              </view>
            ) : null}
            <text className={active ? 'theme-tile__label theme-tile__label--selected' : 'theme-tile__label'}>
              {labelFor(opt)}
            </text>
          </view>
        )
      })}
    </view>
  )
}
