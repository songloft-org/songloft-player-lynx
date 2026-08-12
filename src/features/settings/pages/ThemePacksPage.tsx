import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getThemePacksApi, type ThemePacksApi } from '../api/index.js'
import type { ThemePackItem } from '../api/theme-packs-api.js'
import './ThemePacksPage.css'

export function ThemePacksPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [installed, setInstalled] = useState<ThemePackItem[]>([])
  const [catalog, setCatalog] = useState<ThemePackItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCatalog, setShowCatalog] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const api: ThemePacksApi = getThemePacksApi()

  const refresh = async () => {
    try {
      const [packs, active] = await Promise.all([api.list(), api.getActive()])
      setInstalled(packs)
      setActiveId(active?.themeId ?? null)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { void refresh() }, [])

  const onActivate = (themeId: string) => {
    void api.activate(themeId).then(() => { setActiveId(themeId) })
  }

  const onReset = () => {
    void api.resetToDefault().then(() => { setActiveId(null) })
  }

  const onDelete = (themeId: string) => {
    if (confirmDeleteId !== themeId) {
      setConfirmDeleteId(themeId)
      return
    }
    void api.deletePack(themeId).then(() => {
      setInstalled(prev => prev.filter(p => p.themeId !== themeId))
      if (activeId === themeId) setActiveId(null)
      setConfirmDeleteId(null)
    })
  }

  const onOpenCatalog = () => {
    setShowCatalog(true)
    void api.refreshCatalog().then(setCatalog).catch(() => {})
  }

  const onInstall = (themeId: string) => {
    void api.installFromCatalog(themeId).then(() => void refresh())
  }

  return (
    <view className='theme-packs'>
      <view className='theme-packs__topbar'>
        <view className='theme-packs__back' bindtap={() => navigate({ to: '/settings' })}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='theme-packs__title'>{t('themePacks.title')}</text>
        <view className='theme-packs__action' bindtap={onOpenCatalog}>
          <text className='theme-packs__action-text'>{t('themePacks.catalog')}</text>
        </view>
      </view>

      {showCatalog
        ? (
          <view className='theme-packs__catalog'>
            <view className='theme-packs__catalog-header'>
              <text className='theme-packs__catalog-title'>{t('themePacks.catalogTitle')}</text>
              <view className='theme-packs__catalog-close' bindtap={() => setShowCatalog(false)}>
                <Icon name='x' size={18} color={ICON_COLORS.content} />
              </view>
            </view>
            <scroll-view className='theme-packs__catalog-list' scroll-y>
              {catalog.length === 0
                ? <text className='theme-packs__empty'>{t('themePacks.noCatalog')}</text>
                : catalog.map(p => (
                  <view key={p.themeId} className='theme-packs__item'>
                    <view className='theme-packs__item-info'>
                      <text className='theme-packs__item-name'>{p.name}</text>
                      <text className='theme-packs__item-meta'>{[p.author, p.version].filter(Boolean).join(' · ')}</text>
                    </view>
                    <view className='theme-packs__item-btn' bindtap={() => onInstall(p.themeId)}>
                      <text className='theme-packs__item-btn-text'>{t('themePacks.install')}</text>
                    </view>
                  </view>
                ))}
            </scroll-view>
          </view>
        )
        : (
          <scroll-view className='theme-packs__list' scroll-y>
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
          </scroll-view>
        )}
    </view>
  )
}
