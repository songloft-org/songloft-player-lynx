import { createContext, useContext } from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import './SubPageShell.css'

/**
 * True when the subtree renders inside the settings master–detail **right pane**
 * (>=768px) rather than as its own route.
 *
 * Consumed only by {@link SubPageShell}, to drop the back affordance: in the pane
 * the settings list is already on screen and the router is already at `/settings`,
 * so the arrow is a dead key (a behaviour `LibraryOpsPage` used to carry a comment
 * about rather than fix).
 *
 * Deliberately **not** derived from the viewport width inside the shell: a wide
 * screen can legitimately sit on `/settings/eq` as a real route — a deep link, an
 * e2e `__E2E_ROUTER__.navigate`, or a rotate after drilling in on a narrow screen
 * — and there the arrow is live. Width cannot tell the two apart.
 */
export const SubPageEmbedContext = createContext(false)

export interface SubPageShellProps {
  /** Topbar title, already translated. */
  title: string
  /**
   * Back override. Use it for an in-pane sibling swap — About → Licenses lives in
   * the same pane, so routing there would unmount the whole master–detail page.
   * Same optional-callback shape as `PluginRegistryPage.onBack` (53fb045).
   */
  onBack?: () => void
  /** Route to return to when `onBack` is absent. Defaults to the settings root. */
  backTo?: string
  /** Keeps each page's existing id (`libops-back`, `cache-back`, …). */
  backTestId?: string
  /** Right-aligned topbar slot (PluginManagerPage's refresh / store buttons). */
  actions?: ReactNode
  /**
   * Set false when the page owns its own scrolling — the equalizer's slider area
   * and the plugin registry's `<list>` both need to be the scroll container
   * themselves, and nesting them in a `scroll-view` breaks their gestures.
   */
  scrollable?: boolean
  /** Extra class on the content wrapper, for page-specific layout rules. */
  contentClassName?: string
  children: ReactNode
}

/**
 * Shared chrome for every settings sub-page: topbar (back + title + optional
 * actions) above the page body.
 *
 * Before this existed the 15 sub-pages each hand-rolled the same three elements
 * and had drifted into five different visual variants — three hard-coded `px`
 * paddings and font sizes against the token set, one 28px title, one back chevron
 * rotated 90°, and two stray `border-bottom`s. This is variant A (the four-page
 * majority) made canonical.
 */
export function SubPageShell({
  title,
  onBack,
  backTo = '/settings',
  backTestId,
  actions,
  scrollable = true,
  contentClassName,
  children,
}: SubPageShellProps) {
  const navigate = useNavigate()
  const embedded = useContext(SubPageEmbedContext)

  const goBack = () => {
    if (onBack) onBack()
    else void navigate({ to: backTo })
  }

  // An explicit `onBack` is an in-pane sibling swap, which stays meaningful in the
  // pane — only the implicit "route back to /settings" arrow is the dead one.
  const showBack = !embedded || Boolean(onBack)

  const content = contentClassName
    ? <view className={`subpage__content ${contentClassName}`}>{children}</view>
    : <view className='subpage__content'>{children}</view>

  return (
    <view className='subpage'>
      <view className='subpage__topbar'>
        {showBack
          ? (
            <view className='subpage__back' bindtap={goBack} data-testid={backTestId}>
              <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
            </view>
          )
          : null}
        <text className='subpage__title'>{title}</text>
        {actions ? <view className='subpage__actions'>{actions}</view> : null}
      </view>

      {scrollable
        ? <scroll-view className='subpage__scroll' scroll-y>{content}</scroll-view>
        : content}
    </view>
  )
}
