import { useTranslation } from 'react-i18next'

import {
  DialogRoot,
  DialogView,
  DialogBackdrop,
  DialogContent,
  DialogClose,
} from '@lynx-js/lynx-ui'

export interface DeleteConfirmDialogProps {
  show: boolean
  count: number
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Deletion confirmation dialog — wraps lynx-ui Dialog in controlled mode.
 *
 * If Dialog has compatibility issues on a given platform, the page can fall back
 * to the two-tap confirm pattern used in CacheManagePage. This component
 * encapsulates that decision.
 */
export function DeleteConfirmDialog({
  show,
  count,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <DialogRoot show={show} onShowChange={(open) => { if (!open) onCancel() }}>
      <DialogView>
        <DialogBackdrop className='fp-dialog__backdrop' clickToClose>
          <view className='fp-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent className='fp-dialog__content'>
          <view className='fp-dialog' data-testid='fp-delete-dialog'>
            <text className='fp-dialog__title'>
              {t('libops.dupConfirmDelete')}
            </text>
            <text className='fp-dialog__message'>
              {t('libops.dupDeleteMessage', { count })}
            </text>
            <view className='fp-dialog__actions'>
              <DialogClose>
                <view
                  className='fp-dialog__btn fp-dialog__btn--cancel'
                  bindtap={onCancel}
                  data-testid='fp-delete-cancel'
                >
                  <text className='fp-dialog__btn-text'>
                    {t('libops.cancel')}
                  </text>
                </view>
              </DialogClose>
              <view
                className='fp-dialog__btn fp-dialog__btn--confirm'
                bindtap={onConfirm}
                data-testid='fp-delete-confirm'
              >
                <text className='fp-dialog__btn-text fp-dialog__btn-text--confirm'>
                  {t('libops.dupConfirmDelete')}
                </text>
              </view>
            </view>
          </view>
        </DialogContent>
      </DialogView>
    </DialogRoot>
  )
}
