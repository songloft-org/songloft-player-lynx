import './PageDots.css'

export interface PageDotsProps {
  count: number
  /** Zero-based index of the visible page. */
  index: number
}

/**
 * Dots showing which swiper page is on screen.
 *
 * Not decoration: the cover and the lyrics are two horizontally-swiped screens with
 * nothing else hinting that the second one exists, so on the narrow layout the lyrics
 * were reachable only by guessing. Flutter shows the same pair of dots.
 */
export function PageDots({ count, index }: PageDotsProps) {
  if (count < 2) return null

  return (
    <view className='page-dots' data-testid='page-dots'>
      {Array.from({ length: count }, (_, i) => (
        <view
          key={String(i)}
          className={i === index ? 'page-dots__dot page-dots__dot--active' : 'page-dots__dot'}
        />
      ))}
    </view>
  )
}
