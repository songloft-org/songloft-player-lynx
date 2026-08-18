import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import { openURL } from '../../../native/native-platform.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getSettingsApi } from '../api/index.js'
import { exportAndShareLogs } from '../data/log-export.js'
import { LOG_LEVELS, coerceLogLevel, logLevelLabelKey, type LogLevel } from '../domain/log-level.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import './DiagnosticsPage.css'

/**
 * `/settings/diagnostics` — backend log level and the log-export flow used for
 * issue reports.
 */
export function DiagnosticsPage() {
  const { t } = useTranslation()

  // Unlike theme/language this is a *server* setting (`GET/PUT
  // /api/v1/settings/log-level`), so there is no local module state to seed from.
  // Starts at the same 'info' fallback the API layer uses and is best-effort
  // overridden once the read resolves — an unreachable backend just leaves the
  // fallback, same degrade-gracefully pattern as the rest of settings.
  const [logLevel, setLogLevel] = useState<LogLevel>('info')
  // Log export: busy flag + inline notice (Lynx has no toast primitive; same
  // banner pattern as LibraryOpsPage).
  const [exportingLogs, setExportingLogs] = useState(false)
  const [exportNotice, setExportNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    void getSettingsApi()
      .getLogLevel()
      .then((level) => {
        if (!cancelled) setLogLevel(coerceLogLevel(level))
      })
      .catch(() => {
        /* best-effort — backend unreachable, keep the 'info' fallback */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectLogLevel = (next: LogLevel) => {
    setLogLevel(next)
    void getSettingsApi().setLogLevel(next).catch(() => {
      /* best-effort — backend unreachable; local selection still reflects intent */
    })
  }

  /**
   * Export logs. Backend + client logs are zipped and handed over via `shareFile`
   * — the OS share sheet on native, a browser download on Web. Only when
   * `shareFile` is unavailable (e.g. a host that predates it) does this fall back
   * to opening the sanitized backend log URL directly — that path has no client
   * logs, so it is the degraded option.
   */
  const onExportLogs = () => {
    if (!getPlatformCapabilities().fileExport) {
      const token = getCachedAccessToken()
      if (!token) return
      const url = `${appConfig.resolvedBaseUrl}${apiPrefix}/logs/export?access_token=${encodeURIComponent(token)}`
      openURL(url)
      return
    }
    if (exportingLogs) return
    setExportingLogs(true)
    setExportNotice(null)
    void exportAndShareLogs()
      .then((result) => {
        setExportNotice(result.hasBackend
          ? { kind: 'success', text: t('settings.exportLogsSuccess') }
          : { kind: 'success', text: t('settings.exportLogsSuccessNoBackend') })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e)
        setExportNotice({ kind: 'error', text: t('settings.exportLogsFailed', { error: message }) })
      })
      .finally(() => {
        setExportingLogs(false)
      })
  }

  return (
    <SubPageShell title={t('settings.diagnostics')} backTestId='diagnostics-back'>
      <SettingsSection title={t('settings.logLevelTitle')} icon='settings'>
        {LOG_LEVELS.map((option) => (
          <SettingsRow
            key={option}
            title={t(logLevelLabelKey(option))}
            selected={option === logLevel}
            trailingIcon={option === logLevel ? 'check' : undefined}
            onTap={() => selectLogLevel(option)}
            testId={`log-level-${option}`}
          />
        ))}
      </SettingsSection>

      {exportNotice
        ? (
          <view
            className={exportNotice.kind === 'error'
              ? 'diagnostics__banner diagnostics__banner--error'
              : 'diagnostics__banner'}
            data-testid='export-logs-notice'
          >
            <Icon
              name={exportNotice.kind === 'error' ? 'warning' : 'check-circle'}
              size={18}
              color={exportNotice.kind === 'error' ? ICON_COLORS.danger : ICON_COLORS.primary}
            />
            <text className='diagnostics__banner-text'>{exportNotice.text}</text>
            <view
              className='diagnostics__banner-close'
              bindtap={() => setExportNotice(null)}
              data-testid='export-logs-notice-dismiss'
            >
              <Icon name='x' size={16} color={ICON_COLORS.content2} />
            </view>
          </view>
        )
        : null}

      <SettingsSection>
        <SettingsRow
          icon='menu'
          title={t('settings.exportLogs')}
          subtitle={exportingLogs ? t('settings.exportLogsBusy') : t('settings.exportLogsSubtitle')}
          trailingIcon='chevron-right'
          disabled={exportingLogs}
          onTap={onExportLogs}
          testId='settings-export-logs'
        />
      </SettingsSection>
    </SubPageShell>
  )
}
