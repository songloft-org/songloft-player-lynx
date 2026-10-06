import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'

import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { cancelWebFileTransfer } from '../../../native/web-files.js'
import { canExport, exportPlaylists, importPlaylists } from '../domain/data-transfer.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'

/** Web transfers text through a main-thread file bridge and authenticated HTTP. */
export function DataPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const active = useRef(true)
  const pending = useRef(false)
  const [busy, setBusy] = useState<'import' | 'export' | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const canTransfer = getPlatformCapabilities().dataTransfer

  useEffect(() => {
    active.current = true
    return () => { active.current = false; cancelWebFileTransfer() }
  }, [])

  const handleTransfer = useCallback(async (kind: 'import' | 'export') => {
    if (pending.current || !canExport()) return
    pending.current = true
    setBusy(kind)
    const setStatus = kind === 'import' ? setImportStatus : setExportStatus
    const options = {
      labels: {
        title: t(`data.${kind}`), choose: t('data.chooseFile'),
        save: t('data.saveFile'), cancel: t('common.cancel'),
      },
      isActive: () => active.current,
    }
    try {
      setStatus(null)
      if (kind === 'export') {
        await exportPlaylists(options)
        if (active.current) setStatus(t('data.exportSuccess'))
        return
      }
      const result = await importPlaylists(options)
      // These prefixes cover list/detail/song pages and home statistics.
      void queryClient.invalidateQueries({ queryKey: ['playlist'] })
      void queryClient.invalidateQueries({ queryKey: ['library'] })
      if (active.current) setStatus(t('data.importSuccess', {
        created: result.playlists_created,
        merged: result.playlists_merged,
        songs: result.songs_created + result.songs_matched,
      }))
    } catch (e: unknown) {
      if (!active.current) return
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'cancelled') {
        setStatus(t(`data.${kind}Cancelled`))
      } else {
        const known = ['invalid_json', 'invalid_response', 'file_too_large', 'file_read_failed',
          'file_transfer_failed', 'file_transfer_unavailable', 'session_changed', 'not_logged_in']
        const error = known.includes(msg) ? t(`data.errors.${msg}`) : msg
        setStatus(t(`data.${kind}Failed`, { error }))
      }
    } finally {
      pending.current = false
      if (active.current) setBusy(null)
    }
  }, [t, queryClient])

  return (
    <SubPageShell title={t('settings.categoryData')} backTestId='data-back' grouped>
      {canTransfer
        ? (
          <SettingsSection title={t('data.sectionTitle')}>
            <SettingsRow
              icon='link'
              title={t('data.export')}
              subtitle={busy === 'export' ? t('data.exportBusy') : exportStatus ?? t('data.exportSubtitle')}
              trailingIcon='chevron-right'
              onTap={() => void handleTransfer('export')}
              disabled={busy !== null}
              testId='settings-export'
            />
            <SettingsRow
              icon='folder-open'
              title={t('data.import')}
              subtitle={busy === 'import' ? t('data.importBusy') : importStatus ?? t('data.importSubtitle')}
              trailingIcon='chevron-right'
              onTap={() => void handleTransfer('import')}
              disabled={busy !== null}
              testId='settings-import'
            />
          </SettingsSection>
        )
        : (
          // Rendering nothing here would leave a page with a title bar and a blank
          // body, which reads as a failed load. Say why it is empty instead. The
          // settings list also hides its entry row; this covers the deep link.
          <SettingsSection>
            <SettingsRow
              icon='folder'
              title={t('settings.dataUnavailable')}
              disabled
              testId='settings-data-unavailable'
            />
          </SettingsSection>
        )}
    </SubPageShell>
  )
}
