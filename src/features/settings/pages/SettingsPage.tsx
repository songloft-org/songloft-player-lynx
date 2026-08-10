import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'

import { appConfig } from '../../../core/config/app-config.js'
import { clientVersion, type PlayMode } from '../../../core/config/constants.js'
// Vanilla (non-subscribing) store reads only — same pattern as HomePage /
// LibraryPage — so the settings graph never mounts a zustand subscription
// (which crashes the ReactLynx Vitest snapshot tree) and never pulls the player
// barrel + its lynx-ui gesture leaves.
import { useAuthStore } from '../../auth/store/index.js'
import { usePlayerStore } from '../../player/store/player-store.js'
import {
  PLAY_MODE_OPTIONS,
  playModeDescription,
  playModeIcon,
  playModeLabel,
  serverDisplay,
} from '../domain/settings-model.js'
import { readDefaultPlayMode, writeDefaultPlayMode } from '../data/settings-prefs.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import './SettingsPage.css'

/**
 * Settings page (batch 8), rendered inside the shell at `/settings`. Replaces
 * the batch-1 placeholder.
 *
 * Ported as the **self-contained** slice of the Flutter settings surface:
 * - **Playback** — default play mode (persisted to prefs + applied live to the
 *   batch-5 player store);
 * - **Connection** (standalone only) — view the server address, open the server
 *   sub-page to switch it;
 * - **Appearance** — theme is dark-only today (light/system deferred, shown as a
 *   read-only row rather than half-building a light token set);
 * - **About** — client version + current server + project info;
 * - **Account** — log out (two-tap confirm) → auth store `logout()` → `/login`.
 *
 * The remaining Flutter categories (library scan / cache / upgrade / plugins /
 * downloads / licenses / language) depend on capabilities not yet built and are
 * surfaced as a disabled "Coming later" section; see PROGRESS for the phase each
 * is deferred to.
 */
export function SettingsPage() {
  const navigate = useNavigate()

  // Default play mode: initialise from the live player state (non-subscribing),
  // then override from the persisted pref once it resolves. Selecting an option
  // both persists it AND applies it to the live player (immediate effect).
  const [mode, setMode] = useState<PlayMode>(() => usePlayerStore.getState().playMode)
  const [confirmLogout, setConfirmLogout] = useState(false)

  useEffect(() => {
    let cancelled = false
    void readDefaultPlayMode().then((saved) => {
      if (!cancelled) setMode(saved)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectMode = (next: PlayMode) => {
    setMode(next)
    usePlayerStore.getState().setPlayMode(next)
    void writeDefaultPlayMode(next)
  }

  const openServer = () => {
    void navigate({ to: '/settings/server' })
  }

  const onLogout = () => {
    if (!confirmLogout) {
      setConfirmLogout(true)
      return
    }
    void useAuthStore.getState().logout()
    void navigate({ to: '/login' })
  }

  const showConnection = !appConfig.isEmbedded

  return (
    <view className='settings'>
      <view className='settings__topbar'>
        <text className='settings__title'>Settings</text>
      </view>

      <scroll-view className='settings__scroll' scroll-y>
        <view className='settings__content'>
          <SettingsSection title='Playback' icon='play'>
            {PLAY_MODE_OPTIONS.map((option) => (
              <SettingsRow
                key={option}
                icon={playModeIcon(option)}
                title={playModeLabel(option)}
                subtitle={playModeDescription(option)}
                selected={option === mode}
                trailingIcon={option === mode ? 'check' : undefined}
                onTap={() => selectMode(option)}
                testId={`play-mode-${option}`}
              />
            ))}
          </SettingsSection>

          {showConnection
            ? (
              <SettingsSection title='Connection' icon='link'>
                <SettingsRow
                  icon='link'
                  title='Server'
                  subtitle={serverDisplay(appConfig.baseUrl, appConfig.isEmbedded)}
                  trailingIcon='chevron-right'
                  onTap={openServer}
                  testId='settings-server'
                />
              </SettingsSection>
            )
            : null}

          <SettingsSection title='Appearance' icon='palette'>
            <SettingsRow
              icon='palette'
              title='Theme'
              subtitle='Light and system themes coming in a later version'
              trailingText='Dark'
              disabled
              testId='settings-theme'
            />
          </SettingsSection>

          <SettingsSection title='About' icon='info'>
            <SettingsRow
              icon='info'
              title='App version'
              trailingText={clientVersion}
              testId='settings-version'
            />
            <SettingsRow
              icon='link'
              title='Server'
              subtitle={serverDisplay(appConfig.baseUrl, appConfig.isEmbedded)}
            />
            <SettingsRow
              icon='music'
              title='Songloft'
              subtitle='github.com/songloft-org/songloft'
            />
          </SettingsSection>

          <SettingsSection title='More settings (coming later)' icon='settings'>
            <SettingsRow icon='library' title='Music library scan' subtitle='Deferred' disabled />
            <SettingsRow icon='settings' title='Storage & cache' subtitle='Deferred' disabled />
            <SettingsRow icon='menu' title='Plugins' subtitle='Deferred' disabled />
            <SettingsRow icon='music' title='Language' subtitle='Deferred' disabled />
          </SettingsSection>

          <SettingsSection title='Account' icon='logout'>
            <SettingsRow
              icon='logout'
              title={confirmLogout ? 'Tap again to log out' : 'Log out'}
              subtitle={confirmLogout ? 'This signs you out of this device' : undefined}
              danger
              onTap={onLogout}
              testId='settings-logout'
            />
          </SettingsSection>
        </view>
      </scroll-view>
    </view>
  )
}
