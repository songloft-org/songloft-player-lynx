import { useTranslation } from 'react-i18next'

import { useBackHandler } from '../nav/use-back-handler.js'

import {
  DialogRoot,
  DialogView,
  DialogBackdrop,
  DialogContent,
  DialogClose,
} from '@lynx-js/lynx-ui-dialog'

import './ConfirmDialog.css'

export interface ConfirmDialogProps {
  show: boolean
  title: string
  message: string
  /** Label for the destructive action; the cancel side defaults to `common.cancel`. */
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  /** testids — kept per-call-site so existing render assertions stay meaningful. */
  testId?: string
  confirmTestId?: string
  cancelTestId?: string
}

/**
 * Confirmation before something irreversible.
 *
 * **Use this rather than a two-tap button for anything that destroys data.** The
 * two-tap pattern (tap once to arm, again to commit) is fine for a labelled button
 * that changes its own text — but the plugin list applied it to a 16px `×` whose
 * only armed-state feedback was the glyph turning red, which read as "one tap
 * deletes" and got reported as a missing confirmation.
 *
 * Wraps lynx-ui Dialog in controlled mode. Two hand-rolled copies of this markup
 * existed before (Settings' logout, the duplicate-detection page); see the
 * stylesheet for the design-spec violation that had crept into one of them.
 */
export function ConfirmDialog({
  show,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  testId,
  confirmTestId,
  cancelTestId,
}: ConfirmDialogProps) {
  const { t } = useTranslation()

  /*
   * Back cancels the dialog. Registered here rather than at each call site so every
   * present and future user gets it — the same leverage `SubPageShell` gives the
   * settings sub-pages.
   *
   * `show` starts false at every call site, which is what the stack's
   * activation-order priority requires (see `back-stack.ts`).
   */
  useBackHandler(show, () => {
    onCancel()
    return true
  })

  return (
    <DialogRoot show={show} onShowChange={(open) => { if (!open) onCancel() }}>
      {/*
        * The class carries the modal z-index, and it belongs on this wrapper
        * rather than on the scrim or the card: `DialogView` is `position: fixed`
        * and therefore a stacking context, so a z-index further in only orders
        * the dialog against itself. Left at `auto` it lands *below* every overlay
        * in this app (all z-index 100) — see the stylesheet for the measurement.
        */}
      <DialogView className='confirm-dialog__view'>
        <DialogBackdrop
          className='confirm-dialog__backdrop'
          /*
           * `transition` opts this scrim into the presence *transition* classes
           * (`ui-leaving`). Without a real animation lynx-ui-presence spins its
           * fallback for MAX_WAIT_FRAMES (24) before unmounting, so the dialog
           * sat on screen ~a second after cancel/confirm before vanishing. The
           * stylesheet fades opacity on `ui-leaving`, which fires `transitionend`
           * and lets presence tear down as soon as the fade completes.
           */
          transition
          /*
           * `position: fixed` has to arrive through `style`, not the class:
           * `DialogBackdrop` hard-codes `position: absolute; width: 100%;
           * height: 100%` inline, and inline wins over the stylesheet. So the
           * class's `fixed` was dead and the scrim sized itself against
           * `DialogView`'s box — a `fixed` wrapper with no dimensions, i.e.
           * 0×0. The scrim measured 0×0: invisible, and its outside-tap
           * catcher unreachable. Exactly lynx-ui-popover's backdrop bug one
           * layer down (see `popover-menu-css.test.ts`).
           */
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          clickToClose
        >
          <view className='confirm-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent
          className='confirm-dialog__content'
          transition
          /*
           * Outside-tap cancel lives on the content layer rather than the
           * backdrop: this layer is `fixed; inset: 0` with
           * `event-through={false}`, so it covers the scrim completely and
           * `clickToClose` can never be reached on either platform (Lynx paints
           * in DOM order). `clickToClose` above stays as harmless redundancy.
           */
          dialogContentProps={{ bindtap: onCancel }}
        >
          {/*
            * The card swallows taps (`catchtap`): without it every tap inside —
            * including the confirm button — would bubble to the layer above and
            * fire `onCancel` alongside `onConfirm`.
            */}
          <view className='confirm-dialog' data-testid={testId} catchtap={() => {}}>
            <text className='confirm-dialog__title'>{title}</text>
            <text className='confirm-dialog__message'>{message}</text>
            <view className='confirm-dialog__actions'>
              <DialogClose>
                <view
                  className='confirm-dialog__btn confirm-dialog__btn--cancel'
                  bindtap={onCancel}
                  data-testid={cancelTestId}
                >
                  <text className='confirm-dialog__btn-text'>
                    {cancelLabel ?? t('common.cancel')}
                  </text>
                </view>
              </DialogClose>
              <view
                className='confirm-dialog__btn confirm-dialog__btn--confirm'
                bindtap={onConfirm}
                data-testid={confirmTestId}
              >
                <text className='confirm-dialog__btn-text confirm-dialog__btn-text--confirm'>
                  {confirmLabel}
                </text>
              </view>
            </view>
          </view>
        </DialogContent>
      </DialogView>
    </DialogRoot>
  )
}
