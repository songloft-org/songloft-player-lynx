import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { desktopCall, desktopConfig } from './client.js'
import { appConfig } from '../core/config/app-config.js'
import {
  bundleModeAvailable,
  changeBundleMusicDirectory,
  readBundleMode,
  readBundleMusicDirectory,
  switchBundleMode,
} from '../core/backend/local-mode.js'
import { readLynxGlobal } from '../native/native-modules.js'
import { copyToClipboard } from '../native/native-platform.js'
import { SettingsSection } from '../features/settings/widgets/SettingsSection.js'
import { SettingsRow } from '../features/settings/widgets/SettingsRow.js'

interface LocalState {
  kind: string
  address?: string
  lanAddresses?: string[]
  credentials?: { username: string; password: string }
}
type LocalError =
  | 'failed'
  | 'copyFailed'
  | 'keychainInteractionRequired'
  | 'keychainSigningRequired'

function localError(error: unknown): LocalError {
  const code = error instanceof Error ? error.message : ''
  if (code === 'keychain_interaction_required')
    return 'keychainInteractionRequired'
  if (code === 'keychain_signing_required') return 'keychainSigningRequired'
  return 'failed'
}

export function DesktopLocalSection() {
  const { t } = useTranslation()
  const [state, setState] = useState<LocalState | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<LocalError | null>(null)
  const [musicDirectory, setMusicDirectory] = useState<string | null>(null)
  const available = bundleModeAvailable()
  useEffect(() => {
    if (!available) return
    let active = true
    const read = async () => {
      const [mode, directory] = await Promise.all([readBundleMode(), readBundleMusicDirectory()])
      if (!active) return
      setState((previous) => ({ ...(previous ?? { kind: mode }), kind: mode }))
      setMusicDirectory(directory)
      if (desktopConfig()) {
        void desktopCall<LocalState>('session.mode')
          .then((value) => { if (active) setState(value) })
          .catch(() => {})
      }
    }
    const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
    emitter?.addListener?.('SongloftDesktop.sessionChanged', read)
    read()
    return () => {
      active = false
      emitter?.removeListener?.('SongloftDesktop.sessionChanged', read)
    }
  }, [available])
  if (!available) return null
  const switchMode = (mode: 'local' | 'remote') => {
    'background only'
    if (busy) return
    setBusy(true)
    setError(null)
    void switchBundleMode(mode)
      .then(async (switched) => {
        if (!switched) return
        const nextMode = await readBundleMode()
        setState((previous) => ({ ...(previous ?? { kind: nextMode }), kind: nextMode }))
        setMusicDirectory(await readBundleMusicDirectory())
      })
      .catch((reason) => setError(localError(reason)))
      .finally(() => setBusy(false))
  }
  return (
    <SettingsSection title={t('desktopLocal.title')}>
      <SettingsRow
        title={t('desktopLocal.local')}
        disabled={busy}
        onTap={() => switchMode('local')}
      />
      <SettingsRow
        title={t('desktopLocal.remote')}
        disabled={busy}
        onTap={() => switchMode('remote')}
      />
      {state?.kind === 'local' ? (
        <>
          <SettingsRow
            title={t('settings.server')}
            subtitle={state.address || appConfig.baseUrl}
            onTap={() => {
              void copyToClipboard(state.address || appConfig.baseUrl).catch(() =>
                setError('copyFailed'),
              )
            }}
          />
          {(state.lanAddresses ?? []).map((address) => (
            <SettingsRow
              key={address}
              title={t('desktopLocal.lan')}
              subtitle={address}
              onTap={() => {
                void copyToClipboard(address).catch(() =>
                  setError('copyFailed'),
                )
              }}
            />
          ))}
          {state.credentials ? (
            <>
              <SettingsRow
                title={t('desktopLocal.username')}
                subtitle={state.credentials.username}
              />
              <SettingsRow
                title={t(
                  revealed
                    ? 'desktopLocal.hidePassword'
                    : 'desktopLocal.showPassword',
                )}
                subtitle={revealed ? state.credentials.password : '••••••••'}
                onTap={() => setRevealed((value) => !value)}
              />
              {revealed ? (
                <SettingsRow
                  title={t('desktopLocal.copyPassword')}
                  onTap={() => {
                    void copyToClipboard(state.credentials!.password).catch(
                      () => setError('copyFailed'),
                    )
                  }}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {state?.kind === 'local' ? (
        <SettingsRow
          title={t('desktopLocal.musicDirectory')}
          subtitle={musicDirectory || t('settings.serverNotConfigured')}
          disabled={busy || !!desktopConfig()}
          onTap={async () => {
            try {
              setBusy(true)
              setError(null)
              const selected = await changeBundleMusicDirectory()
              if (selected) setMusicDirectory(selected)
            } catch (reason) {
              setError(localError(reason))
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
      {error ? (
        <text className="client-update__error">
          {t(`desktopLocal.${error}`)}
        </text>
      ) : null}
    </SettingsSection>
  )
}
