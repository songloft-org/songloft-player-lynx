import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { appConfig } from '../../../core/config/app-config.js'
import { updateIdentity } from '../../../core/updater/client-updates.js'
import { nativeUpdateMetadataAvailable, nativeUpdaterAvailable } from '../../../core/updater/native-updater.js'
import { releaseAsset, releasePage, withGithubProxy } from '../../../core/updater/release-resolver.js'
import { cancelClientBundle, checkClientRelease, downloadClientBundle, refreshUpdateSession, restoreClientBuiltin, updateSession } from '../../../core/updater/update-session.js'
import { automaticUpdatePolicy } from '../../../core/updater/automatic-update-policy.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { openURL } from '../../../native/native-platform.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { SettingsRow } from './SettingsRow.js'
import { SettingsSection } from './SettingsSection.js'
import { SwitchRow } from './SwitchRow.js'
import './ClientUpdateSection.css'

function errorKey(error: string): string {
  if (['release_rate_limited', 'release_unpublished', 'release_missing_asset', 'release_changed', 'invalid_update_proxy',
    'metadata_unavailable', 'update_channel_unsupported', 'insufficient_space', 'cancelled', 'checksum_mismatch', 'invalid_release'].includes(error)) return error
  return 'failed'
}
function reasonKey(reason: string): string {
  if (['unavailable', 'signing_key', 'signature_missing', 'signature_invalid'].includes(reason)) return reason
  return 'incompatible'
}

/** Shared manual/automatic update state; prepared bundles activate on the next cold launch. */
export function ClientUpdateSection() {
  const { t } = useTranslation()
  const [session, setSession] = useState(updateSession.getState())
  const [automatic, setAutomatic] = useState(automaticUpdatePolicy.store.getState())
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const web = isWebPlatform()
  const native = !web && nativeUpdaterAvailable()
  const available = web || nativeUpdateMetadataAvailable()
  const { checking, check } = session
  const error = session.checkError ? errorKey(session.checkError) : null
  const identity = updateIdentity(session.native)
  const page = releasePage(identity.channel)
  const busy = checking || session.operation !== null || !!session.native?.download

  useEffect(() => {
    const unsubscribe = updateSession.subscribe(setSession)
    setSession(updateSession.getState())
    void refreshUpdateSession()
    return unsubscribe
  }, [])
  useEffect(() => {
    if (!native) return
    const unsubscribe = automaticUpdatePolicy.store.subscribe(setAutomatic)
    setAutomatic(automaticUpdatePolicy.store.getState())
    void automaticUpdatePolicy.hydrate()
    return unsubscribe
  }, [native])
  useEffect(() => {
    if (!session.native?.download || session.operation) return
    const timer = setInterval(() => { void refreshUpdateSession() }, 2000)
    return () => clearInterval(timer)
  }, [session.native?.download?.task_id, session.operation])
  const startCheck = () => {
    'background only'
    if (!busy) void checkClientRelease({ force: true }).catch(() => { })
  }
  const changeAutomatic = (enabled: boolean) => {
    'background only'
    void automaticUpdatePolicy.setEnabled(enabled)
  }
  const openPackage = () => {
    const platform = getPlatformTarget()
    const assetName = web ? `songloft-lynx-web-${appConfig.isEmbedded ? 'embedded' : 'standalone'}.tar.gz`
      : platform === 'android' ? 'songloft-lynx-android.apk' : platform === 'ios' ? 'songloft-lynx-ios-nosign.ipa'
        : platform === 'harmony' ? 'songloft-lynx-harmony.hap' : null
    const asset = check?.comparison === 'newer' && assetName ? releaseAsset(check.candidate, assetName) : null
    const address = asset && check ? withGithubProxy(asset.browser_download_url, check.candidate.proxy) : page
    if (address) openURL(address)
  }
  const restore = () => {
    if (!restoreConfirm) setRestoreConfirm(true)
    else { setRestoreConfirm(false); void restoreClientBuiltin() }
  }
  const pending = session.native?.pending
  const progress = session.progress ?? session.native?.download
  const showRestore = native && !!session.native && (session.native.running.kind !== 'builtin' || !!pending || !!session.native.active)
  const taskError = session.error ? errorKey(session.error) : null

  return (
    <SettingsSection title={t('clientUpdate.title')}>
      <SettingsRow title={t('clientUpdate.bundleVersion')} subtitle={`${identity.version} · ${identity.git_commit} · ${identity.build_time}`} />
      {native && session.native ? <SettingsRow title={t('clientUpdate.shellVersion')}
        subtitle={`${session.native.host.native_version} · ${session.native.host.git_commit} · ${session.native.host.build_time}`} /> : null}
      <SettingsRow title={t('clientUpdate.channel')} subtitle={identity.channel === 'dev' ? t('clientUpdate.dev')
        : identity.channel === 'stable' ? t('clientUpdate.stable') : t('clientUpdate.unsupported')} />
      {!available && !web ? <text className='client-update__note'>{t('clientUpdate.errors.metadata_unavailable')}</text> : null}
      {native ? <SwitchRow title={t('clientUpdate.automatic')} subtitle={t('clientUpdate.automaticHint')}
        checked={automatic.enabled} onChange={changeAutomatic} disabled={!automatic.loaded || !available || !page}
        testId='client-update-automatic' /> : null}
      <SettingsRow icon='refresh' title={checking ? t('clientUpdate.checking') : t('clientUpdate.check')}
        disabled={busy || !available || !page} onTap={startCheck} testId='client-update-check' />
      {error ? <text className='client-update__error' data-testid='client-update-error'>{t(`clientUpdate.errors.${error}`)}</text> : null}
      {check ? (
        <>
          <SettingsRow title={check.comparison === 'newer' ? t('clientUpdate.available') : check.comparison === 'current'
            ? t('clientUpdate.current') : t('clientUpdate.unknown')}
            subtitle={`${check.candidate.manifest.version} · ${check.candidate.manifest.git_commit} · ${check.candidate.release.published_at}`} />
          {check.candidate.release.body ? <text className='client-update__note'>{check.candidate.release.body.slice(0, 16000)}</text> : null}
          {check.comparison === 'newer' && check.bundleURL && !pending && !session.restored ? <SettingsRow icon='download'
            title={t('clientUpdate.downloadBundle')} subtitle={t('clientUpdate.coldStart')} disabled={busy}
            onTap={() => { void downloadClientBundle(check) }} testId='client-update-download' /> : null}
          {check.comparison === 'newer' && !check.bundleURL && !web ? <text className='client-update__note'>
            {t(`clientUpdate.reasons.${reasonKey(check.bundleReason)}`)}</text> : null}
        </>
      ) : null}
      {progress && (session.operation === 'download' || session.native?.download) ? (
        <>
          <text className='client-update__note' data-testid='client-update-progress'>{t('clientUpdate.progress',
            { percent: progress.total > 0 ? Math.floor(progress.bytes * 100 / progress.total) : 0 })}</text>
          <SettingsRow title={t('common.cancel')} onTap={cancelClientBundle} testId='client-update-cancel' />
        </>
      ) : null}
      {pending ? <SettingsRow title={t('clientUpdate.pending')} subtitle={`${pending.version} · ${pending.git_commit}`} testId='client-update-pending' /> : null}
      {session.restored ? <text className='client-update__note'>{t('clientUpdate.restored')}</text> : null}
      {taskError ? <text className='client-update__error'>{t(`clientUpdate.errors.${taskError}`)}</text> : null}
      {['rollback_unconfirmed', 'startup_failed'].includes(session.native?.last_error ?? '')
        ? <text className='client-update__note'>{t('clientUpdate.recovered')}</text> : null}
      {showRestore && !session.restored ? <SettingsRow danger title={restoreConfirm ? t('clientUpdate.restoreConfirm') : t('clientUpdate.restore')}
        disabled={busy} onTap={restore} testId='client-update-restore' /> : null}
      {page ? <SettingsRow icon='link' title={web ? t('clientUpdate.webPackage') : t('clientUpdate.fullPackage')}
        subtitle={web ? t('clientUpdate.webDeploy') : getPlatformTarget() === 'ios' ? t('clientUpdate.iosSigning') : t('clientUpdate.packageHint')}
        onTap={openPackage} testId='client-update-package' /> : null}
    </SettingsSection>
  )
}
