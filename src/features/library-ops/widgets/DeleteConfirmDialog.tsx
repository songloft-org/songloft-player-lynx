import { useCallback } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import {
  DialogRoot,
  DialogView,
  DialogBackdrop,
  DialogContent,
  DialogClose,
} from '@lynx-js/lynx-ui'

function useLocalT() {
  const { i18n } = useTranslation()
  return useCallback(
    (en: string, zh: string): string => (i18n.language === 'zh' ? zh : en),
    [i18n.language],
  )
}

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
  const lt = useLocalT()

  return (
    <DialogRoot show={show} onShowChange={(open) => { if (!open) onCancel() }}>
      <DialogView>
        <DialogBackdrop className='fp-dialog__backdrop' clickToClose>
          <view className='fp-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent className='fp-dialog__content'>
          <view className='fp-dialog' data-testid='fp-delete-dialog'>
            <text className='fp-dialog__title'>
              {lt('Confirm deletion', '确认删除')}
            </text>
            <text className='fp-dialog__message'>
              {lt(
                `This will delete ${count} duplicate songs and their audio files, keeping the selected version in each group. This action cannot be undone.`,
                `将删除 ${count} 首重复歌曲及其对应的音频文件，保留每组中选中的版本。此操作不可撤销。`,
              )}
            </text>
            <view className='fp-dialog__actions'>
              <DialogClose>
                <view
                  className='fp-dialog__btn fp-dialog__btn--cancel'
                  bindtap={onCancel}
                  data-testid='fp-delete-cancel'
                >
                  <text className='fp-dialog__btn-text'>
                    {lt('Cancel', '取消')}
                  </text>
                </view>
              </DialogClose>
              <view
                className='fp-dialog__btn fp-dialog__btn--confirm'
                bindtap={onConfirm}
                data-testid='fp-delete-confirm'
              >
                <text className='fp-dialog__btn-text fp-dialog__btn-text--confirm'>
                  {lt('Confirm deletion', '确认删除')}
                </text>
              </view>
            </view>
          </view>
        </DialogContent>
      </DialogView>
    </DialogRoot>
  )
}
