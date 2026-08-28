import { useTranslation } from 'react-i18next'

import type { SongTag } from '../../../models/song-tag.js'
import { PromptDialog } from '../../../shared/ui/PromptDialog.js'
import { useUpdateTagMutation } from '../data/song-tags-query.js'
import { toast } from '../../../shared/ui/toast-store.js'

export interface TagRenameDialogProps {
  tag: SongTag
  onClose: () => void
  onDelete?: () => void
}

export function TagRenameDialog({ tag, onClose, onDelete }: TagRenameDialogProps) {
  const { t } = useTranslation()
  const mutation = useUpdateTagMutation()

  return (
    <PromptDialog
      show
      title={t('songTag.rename')}
      label={tag.name}
      initialValue={tag.name}
      confirmLabel={t('common.confirm')}
      onConfirm={(value) => {
        mutation.mutate(
          { id: tag.id, name: value },
          {
            onSuccess: () => {
              toast.show(t('songTag.renamed'))
              onClose()
            },
          },
        )
      }}
      onCancel={onClose}
    />
  )
}
