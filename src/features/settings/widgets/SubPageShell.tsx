import { createContext, useContext } from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { useScrollMemory } from '../../../shared/nav/scroll-memory.js'
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
 * screen can legitimately sit on `/settings/cache` as a real route — a deep link, an
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
  /** Keeps each page's existing id (`libops-back`, `cache-back`, …). */
  backTestId?: string
  /** Right-aligned topbar slot (PluginManagerPage's refresh / store buttons). */
  actions?: ReactNode
  /**
   * Set false when the page owns its own scrolling — the plugin registry's
   * `<list>` needs to be the scroll container itself, and nesting it in a
   * `scroll-view` breaks its gestures.
   */
  scrollable?: boolean
  /** Extra class on the content wrapper, for page-specific layout rules. */
  contentClassName?: string
  /**
   * Remember this page's scroll offset across unmounts, so returning from a
   * drill-in sub-page (e.g. Music library → Duplicate detection) lands where the
   * user left off instead of back at the top. Pass a stable per-page key; omit to
   * keep the default "always start at the top" behaviour. Backed by the same
   * module-level `useScrollMemory` the settings master list uses — see that hook
   * for why it must be module-level (sibling routes unmount the page).
   */
  scrollMemoryKey?: string
  /**
   * True when the page is an Apple **inset-grouped list** — i.e. its body is
   * `SettingsSection` cards. Those pages invert the page background: the page goes
   * to `--system-grouped-background` (grey in light, pure black in dark) so the
   * cards' `--secondary-system-grouped-background` reads as a raised card.
   *
   * Deliberately opt-in rather than applied to every sub-page. Seven of the
   * sixteen have no cards at all (Licenses, Theme catalog, Server edit, Duplicate
   * check, Tab config, Plugin manager, Plugin registry); on those a grey page
   * would put content straight onto the grouped background with nothing raised
   * above it, which is not the grouped pattern — a plain page belongs on
   * `--system-background`.
   */
  grouped?: boolean
  /**
   * Rendered after the scroll area but still inside the single root `<view>` —
   * the place for overlays such as confirm dialogs. Keeping them here (rather
   * than returning a Fragment root of `[shell, dialog]`) matters: a multi-root
   * return makes web-core insert/remove several root nodes per mount, which is
   * where the wasm "recursive use of an object" aliasing crash was reproduced.
   */
  overlay?: ReactNode
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
  backTestId,
  actions,
  scrollable = true,
  contentClassName,
  scrollMemoryKey,
  grouped = false,
  overlay,
  children,
}: SubPageShellProps) {
  const { t } = useTranslation()
  const embedded = useContext(SubPageEmbedContext)

  // Hooks must run unconditionally, so the memory is always resolved; it is only
  // *wired* to the scroll-view when `scrollMemoryKey` is set. The `__none__`
  // fallback key never has `onScroll` attached (no `bindscroll`), so it stays
  // empty and cannot leak an offset into a page that opted out.
  const { initialOffset, onScroll } = useScrollMemory(scrollMemoryKey ?? '__none__')

  /**
   * There used to be a `backTo` prop here, defaulting to `/settings`. It is gone
   * because the hardware back key needs the same answer, and two tables drift: the
   * parent of every route now lives once, in `shared/nav/route-back.ts`, and both
   * this arrow and the back key read it. Pages that returned somewhere other than
   * `/settings` (Licenses → About, Server edit → Servers) are declared there.
   */
  const goBack = () => {
    if (onBack) onBack()
    else performRouteBack()
  }

  // An explicit `onBack` is an in-pane sibling swap, which stays meaningful in the
  // pane — only the implicit "route back to /settings" arrow is the dead one.
  const showBack = !embedded || Boolean(onBack)

  const content = contentClassName
    ? <view className={`subpage__content ${contentClassName}`}>{children}</view>
    : <view className='subpage__content'>{children}</view>

  return (
    <view className={grouped ? 'subpage subpage--grouped' : 'subpage'}>
      <view className='subpage__topbar'>
        {showBack
          ? (
            <view
              className='subpage__back'
              bindtap={goBack}
              accessibility-element={true}
              accessibility-label={t('common.back')}
              data-testid={backTestId}
            >
              <Icon name='chevron-left' size={22} color={ICON_COLORS.content} />
            </view>
          )
          : null}
        <text className='subpage__title'>{title}</text>
        {actions ? <view className='subpage__actions'>{actions}</view> : null}
      </view>

      {scrollable
        ? (
          <scroll-view
            className='subpage__scroll'
            scroll-y
            initial-scroll-offset={scrollMemoryKey ? initialOffset : undefined}
            bindscroll={scrollMemoryKey ? onScroll : undefined}
          >
            {content}
          </scroll-view>
        )
        : content}

      {overlay ?? null}
    </view>
  )
}
