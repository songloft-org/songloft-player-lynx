import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { useBackHandler } from '../nav/use-back-handler.js'

import {
  DialogRoot,
  DialogView,
  DialogBackdrop,
  DialogContent,
  DialogClose,
} from '@lynx-js/lynx-ui-dialog'

import './ConfirmDialog.css'
import './PromptDialog.css'

export interface PromptDialogProps {
  show: boolean
  title: string
  /** Field label, e.g. "Playlist name". */
  label: string
  confirmLabel: string
  /** Called with the trimmed, non-empty value. */
  onConfirm: (value: string) => void
  onCancel: () => void
  testId?: string
  confirmTestId?: string
  cancelTestId?: string
}

/**
 * Single-field input dialog — the counterpart of `ConfirmDialog` for "name this
 * thing" flows (creating a playlist from the add-to-playlist sheet).
 *
 * Shares `ConfirmDialog.css` for the surface and buttons, so the two dialogs
 * cannot drift apart, and repeats its three non-obvious Dialog rules:
 * the backdrop needs `position: fixed` from the inline `style` (lynx-ui
 * hard-codes `absolute` inline, and its parent has no dimensions), outside-tap
 * cancel belongs on the content layer (it covers the backdrop), and the card
 * must `catchtap` or button taps also fire the outside-tap cancel. See
 * `src/shared/ui/__tests__/confirm-dialog-overlay.test.ts`.
 */
export function PromptDialog({
  show,
  title,
  label,
  confirmLabel,
  onConfirm,
  onCancel,
  testId,
  confirmTestId,
  cancelTestId,
}: PromptDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  const cancel = () => {
    setValue('')
    onCancel()
  }

  /*
   * Back cancels. `show` starts false at every call site, which the back stack's
   * activation-order priority requires (see `back-stack.ts`).
   */
  useBackHandler(show, () => {
    cancel()
    return true
  })

  const trimmed = value.trim()
  const canSubmit = trimmed.length > 0

  const confirm = () => {
    if (!canSubmit) return
    setValue('')
    onConfirm(trimmed)
  }

  return (
    <DialogRoot show={show} onShowChange={(open) => { if (!open) cancel() }}>
      <DialogView>
        <DialogBackdrop
          className='confirm-dialog__backdrop'
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          clickToClose
        >
          <view className='confirm-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent
          className='confirm-dialog__content'
          dialogContentProps={{ bindtap: cancel }}
        >
          <view className='confirm-dialog' data-testid={testId} catchtap={() => {}}>
            <text className='confirm-dialog__title'>{title}</text>
            <view className='prompt-dialog__field'>
              <Input
                className='prompt-dialog__input'
                placeholder={label}
                value={value}
                onInput={(v: string) => setValue(v)}
              />
            </view>
            <view className='confirm-dialog__actions'>
              <DialogClose>
                <view
                  className='confirm-dialog__btn confirm-dialog__btn--cancel'
                  bindtap={cancel}
                  data-testid={cancelTestId}
                >
                  <text className='confirm-dialog__btn-text'>{t('common.cancel')}</text>
                </view>
              </DialogClose>
              <view
                className={canSubmit
                  ? 'confirm-dialog__btn confirm-dialog__btn--submit'
                  : 'confirm-dialog__btn confirm-dialog__btn--submit confirm-dialog__btn--disabled'}
                bindtap={confirm}
                data-testid={confirmTestId}
              >
                <text className='confirm-dialog__btn-text confirm-dialog__btn-text--submit'>
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
