import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { desktopCall, desktopConfig } from './client.js'
import { readLynxGlobal } from '../native/native-modules.js'
import { SettingsSection } from '../features/settings/widgets/SettingsSection.js'
import { SettingsRow } from '../features/settings/widgets/SettingsRow.js'

interface UpdateState {
  state: string
  version: string | null
  bytes: number
  total: number
  error: string | null
}
export function DesktopUpdateSection() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<UpdateState>({
    state: 'idle',
    version: null,
    bytes: 0,
    total: 0,
    error: null,
  })
  const supported = desktopConfig()?.capabilities.updates === true
  useEffect(() => {
    if (!supported) return
    let active = true
    const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
    const update = (value: UpdateState) => {
      if (active) setStatus(value)
    }
    emitter?.addListener?.('SongloftDesktop.update', update)
    void desktopCall<UpdateState>('update.state')
      .then(update)
      .catch(() => {})
    return () => {
      active = false
      emitter?.removeListener?.('SongloftDesktop.update', update)
    }
  }, [supported])
  const run = (method: string) => {
    'background only'
    void desktopCall(`update.${method}`).catch(() =>
      setStatus((value) => ({
        ...value,
        state: 'error',
        error: 'update_failed',
      })),
    )
  }
  const busy = ['checking', 'downloading', 'installing'].includes(status.state)
  return (
    <SettingsSection title={t('clientUpdate.title')}>
      {!supported ? (
        <text className="client-update__note">
          {t('desktopUpdate.unavailable')}
        </text>
      ) : null}
      <SettingsRow
        title={t('clientUpdate.check')}
        disabled={!supported || busy}
        onTap={() => run('check')}
        testId="desktop-update-check"
      />
      {status.version ? (
        <SettingsRow
          title={t('desktopUpdate.version')}
          subtitle={status.version}
        />
      ) : null}
      {status.state === 'downloading' ? (
        <>
          <text className="client-update__note">{`${Math.round((status.bytes / Math.max(1, status.total)) * 100)}%`}</text>
          <SettingsRow title={t('common.cancel')} onTap={() => run('cancel')} />
        </>
      ) : null}
      {['available', 'cancelled', 'error'].includes(status.state) &&
      status.version ? (
        <SettingsRow
          title={t('desktopUpdate.download')}
          onTap={() => run('download')}
        />
      ) : null}
      {status.state === 'ready' ? (
        <SettingsRow
          title={t('desktopUpdate.restartInstall')}
          subtitle={t('desktopUpdate.restartHint')}
          onTap={() => run('install')}
          testId="desktop-update-install"
        />
      ) : null}
      {status.error ? (
        <text className="client-update__error">
          {t('clientUpdate.errors.failed')}
        </text>
      ) : null}
    </SettingsSection>
  )
}
