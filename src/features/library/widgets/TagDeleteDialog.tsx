import { useTranslation } from 'react-i18next'

import type { SongTag } from '../../../models/song-tag.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { useDeleteTagMutation } from '../data/song-tags-query.js'
import { toast } from '../../../shared/ui/toast-store.js'

export interface TagDeleteDialogProps {
  tag: SongTag
  onClose: () => void
}

export function TagDeleteDialog({ tag, onClose }: TagDeleteDialogProps) {
  const { t } = useTranslation()
  const mutation = useDeleteTagMutation()

  return (
    <ConfirmDialog
      show
      title={t('songTag.deleteTitle')}
      message={t('songTag.deleteConfirm', { name: tag.name })}
      confirmLabel={t('songTag.deleteAction')}
      onConfirm={() => {
        mutation.mutate(tag.id, {
          onSuccess: () => {
            toast.show(t('songTag.deleted'))
            onClose()
          },
        })
      }}
      onCancel={onClose}
    />
  )
}
