import { useEffect, useState } from '@lynx-js/react'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import { formatBytes } from '../../home/domain/stats-format.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { getSongCacheSize, clearSongCache } from '../../player/data/song-cache.js'
import { readLocalCacheMaxSize, writeLocalCacheMaxSize } from '../../player/data/song-cache-prefs.js'
import { useCacheConfigQuery, useCacheStatsQuery } from '../data/cache-query.js'
import {
  useCleanCacheMutation,
  useUpdateCacheConfigMutation,
  useValidateCacheDirMutation,
} from '../data/cache-mutations.js'
import { TRANSCODE_FORMATS, TRANSCODE_QUALITIES } from '../domain/cache-model.js'
import type { DirValidateResponse } from '../domain/cache-model.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import {
  resolveExactIndex,
  resolveNearestIndex,
  SizeLimitSlider,
} from '../widgets/SizeLimitSlider.js'
import type { SizeLimitOption } from '../widgets/SizeLimitSlider.js'
import './CacheManagePage.css'

const MB = 1024 * 1024

/**
 * Server cache caps — the Flutter `_serverCacheSizeOptions`: server disk, so the
 * range runs up to 100 GB. Deliberately no "unlimited" notch: a stored `0` (or
 * any custom value) displays on the 1 GB default, mirroring Flutter's
 * `_findSizeIndex` fallback.
 */
const SERVER_CACHE_SIZE_OPTIONS: SizeLimitOption[] = [
  { bytes: 100 * MB, label: '100 MB' },
  { bytes: 500 * MB, label: '500 MB' },
  { bytes: 1024 * MB, label: '1 GB' },
  { bytes: 2 * 1024 * MB, label: '2 GB' },
  { bytes: 5 * 1024 * MB, label: '5 GB' },
  { bytes: 10 * 1024 * MB, label: '10 GB' },
  { bytes: 20 * 1024 * MB, label: '20 GB' },
  { bytes: 50 * 1024 * MB, label: '50 GB' },
  { bytes: 100 * 1024 * MB, label: '100 GB' },
]

/** Index of the 1 GB notch — the fallback for off-notch server values. */
const SERVER_MAX_SIZE_FALLBACK_INDEX = 2

/**
 * Preset caps for the on-device song cache (client disk, kept modest) — the
 * Flutter `_localCacheSizeOptions`. Legacy values between notches (256 MB /
 * 512 MB from the pre-slider UI) display on the nearest notch.
 */
const DEVICE_CACHE_SIZE_OPTIONS: SizeLimitOption[] = [
  { bytes: 100 * MB, label: '100 MB' },
  { bytes: 500 * MB, label: '500 MB' },
  { bytes: 1024 * MB, label: '1 GB' },
  { bytes: 2 * 1024 * MB, label: '2 GB' },
  { bytes: 5 * 1024 * MB, label: '5 GB' },
  { bytes: 10 * 1024 * MB, label: '10 GB' },
]

/** Index of the 1 GB notch — `DEFAULT_LOCAL_CACHE_MAX_SIZE`'s slot. */
const DEVICE_MAX_SIZE_FALLBACK_INDEX = 2

/**
 * Cache management sub-page (`/settings/cache`, inside the shell). Sections:
 * stats overview (with used/limit capacity bar), on-device song cache (native
 * only), editable config — where both size caps are notched sliders that
 * commit on drag release rather than riding the Save button — and directory
 * validation result.
 */
export function CacheManagePage() {
  const { t } = useTranslation()

  // ── Data queries ───────────────────────────────────────────────────────────
  const statsQuery = useCacheStatsQuery()
  const configQuery = useCacheConfigQuery()

  // ── Mutations ──────────────────────────────────────────────────────────────
  const cleanMutation = useCleanCacheMutation()
  const updateConfigMutation = useUpdateCacheConfigMutation()
  const validateDirMutation = useValidateCacheDirMutation()

  // ── Local form state (seeded from query data) ──────────────────────────────
  const config = configQuery.data
  const [cacheDir, setCacheDir] = useState<string | null>(null)
  const [transcodeFormat, setTranscodeFormat] = useState<string | null>(null)
  const [transcodeQuality, setTranscodeQuality] = useState<string | null>(null)

  // Effective values: local edit overrides server data.
  const effectiveCacheDir = cacheDir ?? config?.cacheDir ?? ''
  const effectiveFormat = transcodeFormat ?? config?.transcodeFormat ?? ''
  const effectiveQuality = transcodeQuality ?? config?.transcodeQuality ?? '192'

  // ── Server max-size slider ─────────────────────────────────────────────────
  // The slider commits immediately (drag release → PUT), so it sits outside the
  // form's Save button. `pendingServerMaxSize` is a local echo of the committed
  // cap: the config refetch triggered by the mutation takes a round trip, and
  // without the echo the thumb would snap back to the old notch for that whole
  // window. Cleared once the refetched config catches up, or on error so the
  // display stays truthful.
  const [pendingServerMaxSize, setPendingServerMaxSize] = useState<number | null>(null)

  useEffect(() => {
    if (pendingServerMaxSize != null && config?.maxSize === pendingServerMaxSize) {
      setPendingServerMaxSize(null)
    }
  }, [pendingServerMaxSize, config?.maxSize])

  const serverMaxSizeBytes = pendingServerMaxSize ?? config?.maxSize
  const serverMaxSizeIndex = serverMaxSizeBytes != null
    ? resolveExactIndex(
      serverMaxSizeBytes,
      SERVER_CACHE_SIZE_OPTIONS,
      SERVER_MAX_SIZE_FALLBACK_INDEX,
    )
    : SERVER_MAX_SIZE_FALLBACK_INDEX

  const onServerMaxSizeCommit = (bytes: number) => {
    setPendingServerMaxSize(bytes)
    updateConfigMutation.mutate(
      {
        // Everything except the cap comes from the SERVER config, not the local
        // form: a drag must not smuggle un-saved dir/transcode edits into the
        // PUT (the Flutter build's `_updateServerCacheConfig` does the same).
        cache_dir: config?.cacheDir ?? '',
        max_size: bytes,
        transcode_format: config?.transcodeFormat ?? '',
        transcode_quality: config?.transcodeQuality ?? '192',
      },
      { onError: () => setPendingServerMaxSize(null) },
    )
  }

  // ── Two-tap clean confirm ──────────────────────────────────────────────────
  const [confirmClean, setConfirmClean] = useState(false)
  const [confirmClearDevice, setConfirmClearDevice] = useState(false)

  // Back disarms whichever two-tap confirm is armed instead of leaving the page.
  useBackHandler(confirmClean || confirmClearDevice, () => {
    if (confirmClean) {
      setConfirmClean(false)
      return true
    }
    if (confirmClearDevice) {
      setConfirmClearDevice(false)
      return true
    }
    return false
  })

  const onCleanTap = () => {
    if (!confirmClean) {
      setConfirmClean(true)
      return
    }
    cleanMutation.mutate(undefined, {
      onSettled: () => setConfirmClean(false),
    })
  }

  // ── On-device song cache (native `SongloftSongCache`) ─────────────────────
  // A separate cache from the server-side one above: songs the user saved onto
  // this device for offline replay. Only shown where the native module exists.
  const songCacheCapable = getPlatformCapabilities().songCache
  const [deviceCacheSize, setDeviceCacheSize] = useState<number | null>(null)
  const [deviceMaxSize, setDeviceMaxSize] = useState<number | null>(null)

  useEffect(() => {
    if (!songCacheCapable) return
    let alive = true
    void getSongCacheSize().then((s) => { if (alive) setDeviceCacheSize(s) })
    void readLocalCacheMaxSize().then((m) => { if (alive) setDeviceMaxSize(m) })
    return () => { alive = false }
  }, [songCacheCapable])

  const onClearDeviceTap = () => {
    if (!confirmClearDevice) {
      setConfirmClearDevice(true)
      return
    }
    void clearSongCache().then(() => {
      setConfirmClearDevice(false)
      setDeviceCacheSize(0)
    })
  }

  const onSelectDeviceMaxSize = (bytes: number) => {
    setDeviceMaxSize(bytes)
    void writeLocalCacheMaxSize(bytes)
  }

  // ── Directory validation result ────────────────────────────────────────────
  const [validateResult, setValidateResult] = useState<DirValidateResponse | null>(null)

  const onValidateDir = () => {
    if (!effectiveCacheDir.trim()) return
    validateDirMutation.mutate(
      { path: effectiveCacheDir },
      { onSuccess: (data) => setValidateResult(data) },
    )
  }

  // ── Save config (dir + transcode; the size caps commit via their sliders) ──
  const onSave = () => {
    updateConfigMutation.mutate({
      cache_dir: effectiveCacheDir,
      // The slider owns the cap now; keep whatever it last committed (the
      // pending echo also covers a commit whose refetch has not landed yet, so
      // saving the form cannot race the slider's PUT back to the old value).
      max_size: pendingServerMaxSize ?? config?.maxSize ?? 0,
      transcode_format: effectiveFormat,
      transcode_quality: effectiveQuality,
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const stats = statsQuery.data

  return (
    <SubPageShell
      title={t('cacheManage.title')}
      // Deliberately no `onBack`: an explicit onBack tells the shell "this back is
      // meaningful even inside the settings pane", which only holds for an in-pane
      // sibling swap. Routing to /settings is a dead key there.
      backTestId='cache-back'
      contentClassName='cache-manage__content'
    >
      {/* ─── Section 1: Cache Stats (read-only) ─────────────────────── */}
      <SettingsSection
        title={t('cacheManage.overviewSection')}
        icon='info'
      >
        <SettingsRow
          icon='music'
          title={t('cacheManage.fileCount')}
          trailingText={stats ? String(stats.fileCount) : '-'}
          testId='cache-file-count'
        />
        <SettingsRow
          icon='menu'
          title={t('cacheManage.totalSize')}
          trailingText={stats ? formatBytes(stats.totalSize) : '-'}
          testId='cache-total-size'
        />
        {/* Used-of-limit capacity bar (Flutter's LinearProgressIndicator).
            Hidden while unlimited — there is no "of" to show. */}
        {stats && stats.maxSize > 0
          ? (
            <view className='cache-manage__usage' data-testid='cache-usage'>
              <view className='cache-manage__usage-track'>
                <view
                  className={
                    stats.totalSize / stats.maxSize > 0.9
                      ? 'cache-manage__usage-fill cache-manage__usage-fill--danger'
                      : 'cache-manage__usage-fill'
                  }
                  style={{
                    width: `${Math.min(100, Math.max(0, (stats.totalSize / stats.maxSize) * 100))}%`,
                  }}
                  data-testid='cache-usage-fill'
                />
              </view>
            </view>
          )
          : null}
        <SettingsRow
          icon='settings'
          title={t('cacheManage.maxSizeLimit')}
          trailingText={
            stats
              ? stats.maxSize === 0
                ? t('cacheManage.unlimited')
                : formatBytes(stats.maxSize)
              : '-'
          }
          testId='cache-max-size'
        />
        <SettingsRow
          icon='logout'
          title={
            confirmClean
              ? t('cacheManage.confirmClean')
              : t('cacheManage.cleanAll')
          }
          subtitle={
            confirmClean
              ? t('cacheManage.cleanConfirmHint')
              : undefined
          }
          danger
          onTap={onCleanTap}
          testId='cache-clean'
        />
      </SettingsSection>

      {/* ─── Section: On-Device Song Cache (native) ─────────────────────
          Distinct from the server cache above; only rendered where the native
          song-cache module exists (never on Web). */}
      {songCacheCapable
        ? (
          <SettingsSection
            title={t('cacheManage.deviceSection')}
            icon='download'
          >
            <SettingsRow
              icon='music'
              title={t('cacheManage.deviceSize')}
              trailingText={deviceCacheSize != null ? formatBytes(deviceCacheSize) : '-'}
              testId='device-cache-size'
            />
            <view className='cache-manage__field'>
              <SizeLimitSlider
                label={t('cacheManage.deviceMaxSize')}
                options={DEVICE_CACHE_SIZE_OPTIONS}
                selectedIndex={deviceMaxSize != null
                  ? resolveNearestIndex(deviceMaxSize, DEVICE_CACHE_SIZE_OPTIONS)
                  : DEVICE_MAX_SIZE_FALLBACK_INDEX}
                onCommit={onSelectDeviceMaxSize}
                testId='device-max-size'
              />
            </view>
            <SettingsRow
              icon='logout'
              title={
                confirmClearDevice
                  ? t('cacheManage.deviceConfirmClear')
                  : t('cacheManage.deviceClear')
              }
              subtitle={
                confirmClearDevice
                  ? t('cacheManage.cleanConfirmHint')
                  : undefined
              }
              danger
              onTap={onClearDeviceTap}
              testId='device-cache-clear'
            />
          </SettingsSection>
        )
        : null}

      {/* ─── Section 2: Cache Config (editable) ─────────────────────── */}
      <SettingsSection
        title={t('cacheManage.configSection')}
        icon='settings'
      >
        {/* Cache directory */}
        <view className='cache-manage__field'>
          <text className='cache-manage__label'>
            {t('cacheManage.cacheDir')}
          </text>
          <Input
            className='cache-manage__input'
            type='text'
            placeholder={config?.defaultCacheDir || '/tmp/cache'}
            value={effectiveCacheDir}
            onInput={(value) => setCacheDir(value)}
            data-testid='cache-dir-input'
          />
          {config?.defaultCacheDir
            ? (
              <text className='cache-manage__validate-info'>
                {t('cacheManage.defaultPrefix')}{config.defaultCacheDir}
              </text>
            )
            : null}
          <view className='cache-manage__row-actions'>
            <view
              className='cache-manage__btn cache-manage__btn--secondary'
              bindtap={onValidateDir}
              data-testid='cache-validate-btn'
            >
              <text className='cache-manage__btn-text cache-manage__btn-text--secondary'>
                {t('cacheManage.validate')}
              </text>
            </view>
          </view>
        </view>

        {/* Max cache size — commits on drag release, not via Save */}
        <view className='cache-manage__field'>
          <SizeLimitSlider
            label={t('cacheManage.maxSizeLabel')}
            options={SERVER_CACHE_SIZE_OPTIONS}
            selectedIndex={serverMaxSizeIndex}
            onCommit={onServerMaxSizeCommit}
            testId='server-max-size'
          />
        </view>

        {/* Transcode format selector */}
        <view className='cache-manage__field cache-manage__field--rows'>
          <text className='cache-manage__label'>
            {t('cacheManage.transcodeFormat')}
          </text>
          {TRANSCODE_FORMATS.map((fmt) => (
            <SettingsRow
              key={fmt || '__none'}
              title={fmt === '' ? t('cacheManage.noTranscode') : fmt.toUpperCase()}
              selected={effectiveFormat === fmt}
              trailingIcon={effectiveFormat === fmt ? 'check' : undefined}
              onTap={() => setTranscodeFormat(fmt)}
              testId={`format-${fmt || 'none'}`}
            />
          ))}
        </view>

        {/* Transcode quality selector */}
        <view className='cache-manage__field cache-manage__field--rows'>
          <text className='cache-manage__label'>
            {t('cacheManage.transcodeQuality')}
          </text>
          {TRANSCODE_QUALITIES.map((q) => (
            <SettingsRow
              key={q}
              title={`${q} kbps`}
              selected={effectiveQuality === q}
              trailingIcon={effectiveQuality === q ? 'check' : undefined}
              onTap={() => setTranscodeQuality(q)}
              testId={`quality-${q}`}
            />
          ))}
        </view>

        {/* Save button */}
        <view
          className='cache-manage__save'
          bindtap={onSave}
          data-testid='cache-save'
        >
          <text className='cache-manage__save-text'>
            {t('cacheManage.saveConfig')}
          </text>
        </view>
      </SettingsSection>

      {/* ─── Section 3: Directory Validation Result ──────────────────── */}
      {validateResult
        ? (
          <SettingsSection
            title={t('cacheManage.validationSection')}
            icon='info'
          >
            <view className='cache-manage__validate-result' data-testid='validate-result'>
              {validateResult.valid
                ? (
                  <text className='cache-manage__validate-ok'>
                    {t('cacheManage.dirValid')}
                    {validateResult.created
                      ? ` (${t('cacheManage.dirCreated')})`
                      : ''}
                  </text>
                )
                : (
                  <text className='cache-manage__validate-err'>
                    {t('cacheManage.dirInvalid')}
                    {validateResult.error
                      ? `: ${validateResult.error}`
                      : ''}
                  </text>
                )}
              <text className='cache-manage__validate-info'>
                {t('cacheManage.totalSpacePrefix')}{formatBytes(validateResult.totalSize)}
              </text>
              <text className='cache-manage__validate-info'>
                {t('cacheManage.freeSpacePrefix')}{formatBytes(validateResult.freeSize)}
              </text>
            </view>
          </SettingsSection>
        )
        : null}
    </SubPageShell>
  )
}
