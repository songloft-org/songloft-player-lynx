import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import {
  activateThemePack,
  applyActiveThemePack,
  clearActiveThemePack,
  getActiveThemePack,
  subscribeActiveThemePack,
} from '../../../shared/theme/theme-pack-model.js'
import { toast } from '../../../shared/ui/toast-store.js'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getThemePacksApi, type ThemePacksApi } from '../api/index.js'
import type { ThemePackItem } from '../api/theme-packs-api.js'
import { SettingsRow } from './SettingsRow.js'
import { SettingsSection } from './SettingsSection.js'
import './ThemePacksSection.css'

/**
 * The theme-pack card on the appearance page: the installed list (default +
 * packs, activate / two-tap delete) with a tail row into the theme store.
 *
 * The store itself is a separate page (`/settings/theme-catalog`) — browsing
 * what can be installed is a different activity than picking the active pack.
 * This card owns no scrolling; the page's `SubPageShell` does that.
 */
export function ThemePacksSection({ onOpenCatalog }: { onOpenCatalog?: () => void }) {
  const { t } = useTranslation()

  const [installed, setInstalled] = useState<ThemePackItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(() => getActiveThemePack()?.themeId ?? null)
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // The armed delete is a per-row two-tap state; back disarms it.
  useBackHandler(confirmDeleteId !== null, () => {
    setConfirmDeleteId(null)
    return true
  })

  const api: ThemePacksApi = getThemePacksApi()

  // The active pack is app-global (activating it recolors the whole UI), so its
  // id is the model's, not section-local — the startup wiring in `index.tsx` and
  // taps here stay in agreement for free.
  useEffect(
    () => subscribeActiveThemePack(() => {
      setActiveId(getActiveThemePack()?.themeId ?? null)
    }),
    [],
  )

  const refresh = async () => {
    try {
      const [packs] = await Promise.all([
        api.list(),
        // Also re-sync the active pack: it may have been set from the Flutter
        // client (or the server) since this app last looked.
        applyActiveThemePack(),
      ])
      setInstalled(packs)
    } catch { /* keep whatever was there */ }
    setLoading(false)
  }

  useEffect(() => { void refresh() }, [])

  const onActivate = (themeId: string) => {
    void activateThemePack(themeId).catch((e: unknown) => {
      toast.error(t('themePacks.activateFailed', { error: messageOf(e) }))
    })
  }

  const onReset = () => {
    void clearActiveThemePack().catch((e: unknown) => {
      toast.error(t('themePacks.activateFailed', { error: messageOf(e) }))
    })
  }

  const onDelete = (themeId: string) => {
    if (confirmDeleteId !== themeId) {
      setConfirmDeleteId(themeId)
      return
    }
    void api.deletePack(themeId)
      .then(() => {
        setInstalled(prev => prev.filter(p => p.themeId !== themeId))
        if (activeId === themeId) setActiveId(null)
        setConfirmDeleteId(null)
        // Deleting the active pack leaves the server's "active" pointing at a
        // missing id; re-sync so the UI and the server agree on the fallback.
        return applyActiveThemePack()
      })
      .catch((e: unknown) => {
        toast.error(t('themePacks.deleteFailed', { error: messageOf(e) }))
      })
  }

  return (
    <SettingsSection title={t('themePacks.title')}>
      {loading
        ? <text className='theme-packs__empty'>{t('common.loading')}</text>
        : installed.length === 0
          ? <text className='theme-packs__empty'>{t('themePacks.noThemes')}</text>
          : (
            <view>
              <view className='theme-packs__item' bindtap={onReset}>
                <view className='theme-packs__item-info'>
                  <text className='theme-packs__item-name'>{t('themePacks.default')}</text>
                  <text className='theme-packs__item-meta'>{t('themePacks.builtIn')}</text>
                </view>
                {activeId === null
                  ? <Icon name='check' size={18} color={ICON_COLORS.primary} />
                  : null}
              </view>
              {installed.map(p => (
                <view key={p.themeId} className='theme-packs__item'>
                  <view className='theme-packs__item-info' bindtap={() => onActivate(p.themeId)}>
                    <text className='theme-packs__item-name'>{p.name}</text>
                    <text className='theme-packs__item-meta'>
                      {[p.author, p.version].filter(Boolean).join(' · ')}
                    </text>
                  </view>
                  {activeId === p.themeId
                    ? <Icon name='check' size={18} color={ICON_COLORS.primary} />
                    : (
                      <view className='theme-packs__item-delete' bindtap={() => onDelete(p.themeId)}>
                        <text className='theme-packs__item-delete-text'>
                          {confirmDeleteId === p.themeId ? t('themePacks.confirmDelete') : t('themePacks.delete')}
                        </text>
                      </view>
                    )}
                </view>
              ))}
            </view>
          )}
      {/* The store entry — a plain navigation row, so it reads as leaving this
          list rather than acting on a row of it. */}
      <view className='theme-packs__entry'>
        <SettingsRow
          title={t('themePacks.catalog')}
          trailingIcon='chevron-right'
          onTap={onOpenCatalog}
          testId='theme-packs-catalog-open'
        />
      </view>
    </SettingsSection>
  )
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
