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
  /**
   * Keyboard to ask for. `'number'` is what the sleep timer's custom values want;
   * it is a hint only, so the field still has to be validated.
   */
  inputType?: 'text' | 'number'
  /**
   * Rejects a value on submit, returning the message to show under the field.
   * Return `undefined` to accept.
   *
   * On submit rather than on every keystroke, and the dialog stays open with the
   * text intact: a range like "1 - 999" is failed by every prefix of a valid
   * answer, so validating as you type would flag `"1"` on the way to `"120"`.
   */
  validate?: (value: string) => string | undefined
  testId?: string
  confirmTestId?: string
  cancelTestId?: string
  errorTestId?: string
}

/**
 * Single-field input dialog — the counterpart of `ConfirmDialog` for "name this
 * thing" flows (creating a playlist from the add-to-playlist sheet).
 *
 * Shares `ConfirmDialog.css` for the surface and buttons, so the two dialogs
 * cannot drift apart, and repeats its four non-obvious Dialog rules:
 * the modal z-index goes on `DialogView` (a fixed element is a stacking context,
 * so nothing further in can lift the dialog above the sheet that opened it), the
 * backdrop needs `position: fixed` from the inline `style` (lynx-ui
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
  inputType = 'text',
  validate,
  testId,
  confirmTestId,
  cancelTestId,
  errorTestId,
}: PromptDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  const cancel = () => {
    setValue('')
    setError(undefined)
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
    const rejected = validate?.(trimmed)
    if (rejected !== undefined) {
      setError(rejected)
      return
    }
    setValue('')
    setError(undefined)
    onConfirm(trimmed)
  }

  return (
    <DialogRoot show={show} onShowChange={(open) => { if (!open) cancel() }}>
      <DialogView className='confirm-dialog__view'>
        <DialogBackdrop
          className='confirm-dialog__backdrop'
          /*
           * `transition` opts into the presence `ui-leaving` class so the exit
           * fade (see stylesheet) fires `transitionend` and unmounts at once,
           * instead of lynx-ui-presence's 24-frame fallback wait that left the
           * dialog lingering ~a second after cancel/confirm.
           */
          transition
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          clickToClose
        >
          <view className='confirm-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent
          className='confirm-dialog__content'
          transition
          dialogContentProps={{ bindtap: cancel }}
        >
          <view className='confirm-dialog' data-testid={testId} catchtap={() => {}}>
            <text className='confirm-dialog__title'>{title}</text>
            <view className='prompt-dialog__field'>
              <Input
                className='prompt-dialog__input'
                type={inputType}
                placeholder={label}
                value={value}
                onInput={(v: string) => {
                  setValue(v)
                  // Clear on edit: leaving the old complaint under a field the user
                  // is already fixing reads as "still wrong".
                  setError(undefined)
                }}
              />
              {/* Inside the field wrapper, so it sits snug under the input and
                  keeps the wrapper's spacing to the buttons below. */}
              {error
                ? (
                  <text className='prompt-dialog__error' data-testid={errorTestId}>
                    {error}
                  </text>
                )
                : null}
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
