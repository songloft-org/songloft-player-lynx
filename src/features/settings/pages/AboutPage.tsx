import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { appConfig } from '../../../core/config/app-config.js'
import { clientVersion } from '../../../core/config/constants.js'
import { getSettingsApi } from '../api/index.js'
import { serverDisplay } from '../domain/settings-model.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import { UpgradeSection } from '../widgets/UpgradeSection.js'

export interface AboutPageProps {
  /**
   * Open the licenses page without a route navigation. The settings detail pane
   * passes this so About → Licenses is a swap *inside* the pane: routing to
   * `/settings/licenses` would unmount the whole master–detail page and drop the
   * settings list. Same pattern as `PluginManagerPage.onOpenStore` (53fb045).
   */
  onOpenLicenses?: () => void
}

/**
 * `/settings/about` — client / backend versions, the server this build talks to,
 * the project link, the open-source licenses **and** the backend update check.
 * "后端更新" (backend update) used to be its own route (`/settings/upgrade`); it
 * merged in here because the two are the same "what is this build, is it current"
 * question — version rows and an update check sit naturally together.
 */
export function AboutPage({ onOpenLicenses }: AboutPageProps = {}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [backendVersion, setBackendVersion] = useState('')

  useEffect(() => {
    let cancelled = false
    void getSettingsApi().getVersion()
      .then((v) => { if (!cancelled) setBackendVersion(v) })
      .catch(() => {
        /* best-effort — backend unreachable, the row just stays hidden */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Recomputed per render rather than hoisted to a module constant:
  // `appConfig.baseUrl` changes when the user switches servers.
  const serverText = serverDisplay(appConfig.baseUrl, appConfig.isEmbedded, {
    embedded: t('settings.serverEmbedded'),
    notConfigured: t('settings.serverNotConfigured'),
  })

  const openLicenses = () => {
    if (onOpenLicenses) onOpenLicenses()
    else void navigate({ to: '/settings/licenses' })
  }

  return (
    <SubPageShell title={t('settings.aboutUpdates')} backTestId='about-back' grouped>
      <SettingsSection title={t('settings.about')} icon='info'>
        <SettingsRow
          icon='info'
          tint='gray'
          title={t('settings.appVersion')}
          trailingText={clientVersion}
          testId='settings-version'
        />
        {backendVersion
          ? <SettingsRow icon='info' tint='gray' title={t('settings.backendVersion')} trailingText={backendVersion} />
          : null}
        <SettingsRow
          icon='link'
          tint='blue'
          title={t('settings.server')}
          subtitle={serverText}
        />
        <SettingsRow
          icon='music'
          tint='pink'
          title={t('settings.songloft')}
          subtitle={t('settings.songloftUrl')}
        />
      </SettingsSection>

      <SettingsSection title={t('upgrade.title')} icon='refresh'>
        <UpgradeSection />
      </SettingsSection>

      <SettingsSection>
        <SettingsRow
          icon='info'
          tint='gray'
          title={t('settings.licenses')}
          trailingIcon='chevron-right'
          onTap={openLicenses}
          testId='settings-licenses'
        />
      </SettingsSection>
    </SubPageShell>
  )
}
