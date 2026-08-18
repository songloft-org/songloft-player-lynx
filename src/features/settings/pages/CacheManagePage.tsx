import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import { formatBytes } from '../../home/domain/stats-format.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
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
import './CacheManagePage.css'

/**
 * Cache management sub-page (`/settings/cache`, inside the shell). Three
 * sections: stats overview, editable config, directory validation result.
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
  const [maxSize, setMaxSize] = useState<string | null>(null)
  const [transcodeFormat, setTranscodeFormat] = useState<string | null>(null)
  const [transcodeQuality, setTranscodeQuality] = useState<string | null>(null)

  // Effective values: local edit overrides server data.
  const effectiveCacheDir = cacheDir ?? config?.cacheDir ?? ''
  const effectiveMaxSize = maxSize ?? (config ? String(config.maxSize) : '0')
  const effectiveFormat = transcodeFormat ?? config?.transcodeFormat ?? ''
  const effectiveQuality = transcodeQuality ?? config?.transcodeQuality ?? '192'

  // ── Two-tap clean confirm ──────────────────────────────────────────────────
  const [confirmClean, setConfirmClean] = useState(false)

  const onCleanTap = () => {
    if (!confirmClean) {
      setConfirmClean(true)
      return
    }
    cleanMutation.mutate(undefined, {
      onSettled: () => setConfirmClean(false),
    })
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

  // ── Save config ────────────────────────────────────────────────────────────
  const onSave = () => {
    const parsedMaxSize = parseInt(effectiveMaxSize, 10)
    updateConfigMutation.mutate({
      cache_dir: effectiveCacheDir,
      max_size: Number.isFinite(parsedMaxSize) && parsedMaxSize >= 0 ? parsedMaxSize : 0,
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

        {/* Max cache size */}
        <view className='cache-manage__field'>
          <text className='cache-manage__label'>
            {t('cacheManage.maxSizeLabel')}
          </text>
          <Input
            className='cache-manage__input'
            type='text'
            placeholder='0'
            value={effectiveMaxSize}
            onInput={(value) => setMaxSize(value)}
            data-testid='cache-max-size-input'
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
