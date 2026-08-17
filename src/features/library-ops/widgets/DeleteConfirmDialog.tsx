import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'

export interface DeleteConfirmDialogProps {
  show: boolean
  count: number
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Duplicate-deletion confirmation — the wording, over the shared
 * {@link ConfirmDialog}.
 *
 * This used to carry its own copy of the dialog markup and stylesheet, which had
 * drifted into a solid red confirm button; DESIGN.md allows `--danger` as text
 * only, never as a fill.
 */
export function DeleteConfirmDialog({ show, count, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <ConfirmDialog
      show={show}
      title={t('libops.dupConfirmDelete')}
      message={t('libops.dupDeleteMessage', { count })}
      confirmLabel={t('libops.dupConfirmDelete')}
      cancelLabel={t('libops.cancel')}
      onConfirm={onConfirm}
      onCancel={onCancel}
      testId='fp-delete-dialog'
      confirmTestId='fp-delete-confirm'
      cancelTestId='fp-delete-cancel'
    />
  )
}
