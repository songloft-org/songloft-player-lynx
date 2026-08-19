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
      <DialogView>
        <DialogBackdrop className='confirm-dialog__backdrop' clickToClose>
          <view className='confirm-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent className='confirm-dialog__content'>
          <view className='confirm-dialog' data-testid={testId}>
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
