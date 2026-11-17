import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { Markdown } from '../../../shared/ui/Markdown.js'
import { getTermsContent } from '../legal/terms.js'

export function TermsDialog({ show, onClose }: { show: boolean, onClose: () => void }) {
  const { t, i18n } = useTranslation()
  return (
    <ConfirmDialog
      show={show}
      title={t('auth.termsAndPrivacy')}
      message=''
      confirmLabel={t('common.close')}
      acknowledgeOnly
      onConfirm={onClose}
      onCancel={onClose}
      testId='terms-dialog'
      confirmTestId='terms-close'
    >
      <Markdown content={getTermsContent(i18n.language)} />
    </ConfirmDialog>
  )
}
