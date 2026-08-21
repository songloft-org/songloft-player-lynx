import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import './PlaylistDescPanel.css'

export interface PlaylistDescPanelProps {
  /** Panel heading — the playlist's own name. */
  title: string
  /** The full, untruncated description text. */
  description: string
  onClose: () => void
}

/**
 * The playlist's full description, in a bottom panel.
 *
 * The detail page's hero caps the description at two clamped lines (the meta
 * column is as tall as the cover, so the song count can never be pushed off).
 * Tapping it opens this panel instead of nesting a scroll area inside the
 * header — a ~35px touch target nobody can reliably scroll, competing with the
 * song list for gestures.
 *
 * Built on the `PlayHistoryPanel` / `GlobalMenu` pattern (fixed root +
 * backdrop + bottom panel): the call site renders it **only while open**, so
 * mounting is the open state and there is no request or state to leak between
 * visits. The trade-off is no drag-to-dismiss, same as the history panel.
 */
export function PlaylistDescPanel({ title, description, onClose }: PlaylistDescPanelProps) {
  const { t } = useTranslation()

  /*
   * Registered unconditionally because the call site only renders this
   * component while it is open — the mount *is* the open state.
   */
  useBackHandler(true, () => {
    onClose()
    return true
  })

  return (
    <view className='playlist-desc' bindtap={onClose} data-testid='playlist-desc-panel'>
      <view className='playlist-desc__backdrop' />
      <view className='playlist-desc__panel' catchtap={() => {}}>
        <view className='playlist-desc__header'>
          <text className='playlist-desc__title'>{title}</text>
          <view className='playlist-desc__close' bindtap={onClose} data-testid='playlist-desc-close'>
            <Icon name='x' size={18} color={ICON_COLORS.content2} />
          </view>
        </view>
        <scroll-view className='playlist-desc__scroll' scroll-y>
          <text className='playlist-desc__text'>{description}</text>
        </scroll-view>
      </view>
    </view>
  )
}
