import { useCallback, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { canExport, exportPlaylists, importPlaylists } from '../domain/data-transfer.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'

/**
 * `/settings/data` — playlist export / import.
 *
 * Both directions go through the platform module's file picker / openURL, which do
 * not exist in the render realm on Web. Rendering the rows anyway made "export" a
 * dead tap and surfaced the internal string "SongloftPlatform native module not
 * available" to the user.
 */
export function DataPage() {
  const { t } = useTranslation()
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const canTransfer = getPlatformCapabilities().dataTransfer

  const handleExport = useCallback(() => {
    if (!canExport()) return
    exportPlaylists()
  }, [])

  const handleImport = useCallback(async () => {
    try {
      setImportStatus(null)
      const result = await importPlaylists()
      setImportStatus(
        t('data.importSuccess', {
          created: result.playlists_created,
          merged: result.playlists_merged,
          songs: result.songs_created + result.songs_matched,
        }),
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'cancelled') {
        setImportStatus(t('data.importCancelled'))
      } else {
        setImportStatus(t('data.importFailed', { error: msg }))
      }
    }
  }, [t])

  return (
    <SubPageShell title={t('settings.categoryData')} backTestId='data-back' grouped>
      {canTransfer
        ? (
          <SettingsSection title={t('data.sectionTitle')} icon='folder'>
            <SettingsRow
              icon='link'
              tint='blue'
              title={t('data.export')}
              subtitle={t('data.exportSubtitle')}
              trailingIcon='chevron-right'
              onTap={handleExport}
              testId='settings-export'
            />
            <SettingsRow
              icon='folder-open'
              tint='green'
              title={t('data.import')}
              subtitle={importStatus ?? t('data.importSubtitle')}
              trailingIcon='chevron-right'
              onTap={() => void handleImport()}
              testId='settings-import'
            />
          </SettingsSection>
        )
        : (
          // Rendering nothing here would leave a page with a title bar and a blank
          // body, which reads as a failed load. Say why it is empty instead. The
          // settings list also hides its entry row; this covers the deep link.
          <SettingsSection icon='folder'>
            <SettingsRow
              icon='folder'
              tint='gray'
              title={t('settings.dataUnavailable')}
              disabled
              testId='settings-data-unavailable'
            />
          </SettingsSection>
        )}
    </SubPageShell>
  )
}
