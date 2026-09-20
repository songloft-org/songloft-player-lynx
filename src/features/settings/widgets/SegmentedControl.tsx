import './SegmentedControl.css'

export interface SegmentedControlProps<T extends string> {
  /** Mutually-exclusive choices, rendered left→right in order. */
  options: readonly T[]
  selected: T
  onSelect: (value: T) => void
  /** Display label for a choice (already translated by the caller). */
  labelFor: (value: T) => string
  testId?: string
}

/**
 * iOS-style segmented control (`UISegmentedControl`): a single rounded track of
 * `--secondary-system-fill` with the selected segment raised as a lighter
 * capsule. Used where a small fixed set of choices should be switchable in
 * place without opening a picker — the Apple pattern for 2–4 options that
 * previously needed a checkmark-list sub-page.
 */
export function SegmentedControl<T extends string>({
  options,
  selected,
  onSelect,
  labelFor,
  testId,
}: SegmentedControlProps<T>) {
  const selectedIndex = options.indexOf(selected)
  return (
    <view className='segmented' data-testid={testId}>
      {/* Sliding indicator — positioned behind the items (earlier in DOM order). */}
      <view
        className='segmented__indicator'
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${selectedIndex * 100}%)`,
        }}
      />
      {options.map((opt) => {
        const active = opt === selected
        return (
          <view
            key={opt}
            className={active ? 'segmented__item segmented__item--selected' : 'segmented__item'}
            bindtap={() => onSelect(opt)}
            data-testid={testId ? `${testId}-${opt}` : undefined}
          >
            <text className={active ? 'segmented__label segmented__label--selected' : 'segmented__label'}>
              {labelFor(opt)}
            </text>
          </view>
        )
      })}
    </view>
  )
}
