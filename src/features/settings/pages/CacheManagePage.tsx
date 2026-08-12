import { useCallback, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
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
import './CacheManagePage.css'

/**
 * Inline i18n helper — returns zh string when language is Chinese, en otherwise.
 * All user-visible text is kept here (not in resources.ts) per the task spec.
 */
function useLocalT() {
  const { i18n } = useTranslation()
  return useCallback(
    (en: string, zh: string): string => (i18n.language === 'zh' ? zh : en),
    [i18n.language],
  )
}

/**
 * Cache management sub-page (`/settings/cache`, inside the shell). Three
 * sections: stats overview, editable config, directory validation result.
 */
export function CacheManagePage() {
  const navigate = useNavigate()
  const lt = useLocalT()

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

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goBack = () => {
    void navigate({ to: '/settings' })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const stats = statsQuery.data

  return (
    <view className='cache-manage'>
      <view className='cache-manage__topbar'>
        <view className='cache-manage__back' bindtap={goBack} data-testid='cache-back'>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='cache-manage__title'>
          {lt('Cache Management', '缓存管理')}
        </text>
      </view>

      <scroll-view className='cache-manage__scroll' scroll-y>
        <view className='cache-manage__content'>
          {/* ─── Section 1: Cache Stats (read-only) ─────────────────────── */}
          <SettingsSection
            title={lt('Cache Overview', '缓存概览')}
            icon='info'
          >
            <SettingsRow
              icon='music'
              title={lt('Cached Files', '缓存文件数')}
              trailingText={stats ? String(stats.fileCount) : '-'}
              testId='cache-file-count'
            />
            <SettingsRow
              icon='menu'
              title={lt('Total Size', '缓存总大小')}
              trailingText={stats ? formatBytes(stats.totalSize) : '-'}
              testId='cache-total-size'
            />
            <SettingsRow
              icon='settings'
              title={lt('Max Size Limit', '最大大小限制')}
              trailingText={
                stats
                  ? stats.maxSize === 0
                    ? lt('Unlimited', '无限制')
                    : formatBytes(stats.maxSize)
                  : '-'
              }
              testId='cache-max-size'
            />
            <SettingsRow
              icon='logout'
              title={
                confirmClean
                  ? lt('Confirm Clean?', '确认清理？')
                  : lt('Clean All Cache', '清理全部缓存')
              }
              subtitle={
                confirmClean
                  ? lt('Tap again to confirm', '再次点击确认')
                  : undefined
              }
              danger
              onTap={onCleanTap}
              testId='cache-clean'
            />
          </SettingsSection>

          {/* ─── Section 2: Cache Config (editable) ─────────────────────── */}
          <SettingsSection
            title={lt('Cache Configuration', '缓存配置')}
            icon='settings'
          >
            {/* Cache directory */}
            <view className='cache-manage__field'>
              <text className='cache-manage__label'>
                {lt('Cache Directory', '缓存目录')}
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
                    {lt('Default: ', '默认: ')}{config.defaultCacheDir}
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
                    {lt('Validate', '验证')}
                  </text>
                </view>
              </view>
            </view>

            {/* Max cache size */}
            <view className='cache-manage__field'>
              <text className='cache-manage__label'>
                {lt('Max Cache Size (bytes, 0=unlimited)', '最大缓存大小（字节，0=无限制）')}
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
            <view className='cache-manage__field'>
              <text className='cache-manage__label'>
                {lt('Transcode Format', '转码格式')}
              </text>
              {TRANSCODE_FORMATS.map((fmt) => (
                <SettingsRow
                  key={fmt || '__none'}
                  title={fmt === '' ? lt('No transcode', '不转码') : fmt.toUpperCase()}
                  selected={effectiveFormat === fmt}
                  trailingIcon={effectiveFormat === fmt ? 'check' : undefined}
                  onTap={() => setTranscodeFormat(fmt)}
                  testId={`format-${fmt || 'none'}`}
                />
              ))}
            </view>

            {/* Transcode quality selector */}
            <view className='cache-manage__field'>
              <text className='cache-manage__label'>
                {lt('Transcode Quality', '转码质量')}
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
                {lt('Save Configuration', '保存配置')}
              </text>
            </view>
          </SettingsSection>

          {/* ─── Section 3: Directory Validation Result ──────────────────── */}
          {validateResult
            ? (
              <SettingsSection
                title={lt('Validation Result', '验证结果')}
                icon='info'
              >
                <view className='cache-manage__validate-result' data-testid='validate-result'>
                  {validateResult.valid
                    ? (
                      <text className='cache-manage__validate-ok'>
                        {lt('Directory is valid', '目录有效')}
                        {validateResult.created
                          ? ` (${lt('created', '已创建')})`
                          : ''}
                      </text>
                    )
                    : (
                      <text className='cache-manage__validate-err'>
                        {lt('Directory is invalid', '目录无效')}
                        {validateResult.error
                          ? `: ${validateResult.error}`
                          : ''}
                      </text>
                    )}
                  <text className='cache-manage__validate-info'>
                    {lt('Total space: ', '总空间: ')}{formatBytes(validateResult.totalSize)}
                  </text>
                  <text className='cache-manage__validate-info'>
                    {lt('Free space: ', '剩余空间: ')}{formatBytes(validateResult.freeSize)}
                  </text>
                </view>
              </SettingsSection>
            )
            : null}
        </view>
      </scroll-view>
    </view>
  )
}
