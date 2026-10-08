import { useEffect, useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { appConfig } from '../../../core/config/app-config.js'
import { openURL } from '../../../native/native-platform.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { useScrollMemory } from '../../../shared/nav/scroll-memory.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { SubPageShell } from '../../settings/widgets/SubPageShell.js'
import { GithubDiscoveryError } from '../api/github-discovery-api.js'
import { discoveryErrorKey, useDiscoveryHostVersion, useGithubDiscoveryQuery } from '../data/github-discovery-query.js'
import { useGithubProxyQuery, usePluginsQuery } from '../data/jsplugin-query.js'
import { useInstallFromRegistryMutation } from '../data/jsplugin-mutations.js'
import { updateRegistryReturnState } from '../data/registry-return-state.js'
import { downloadRepository, discoveryHasUpdate, hostCompatibility, installedFromRepository, occupiedPlugin, type GithubPlugin } from '../domain/github-plugin-validation.js'
import './PluginRegistryPage.css'
import './GithubDiscoveryPage.css'

export function GithubDiscoveryPage({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<'updated' | 'stars'>('updated')
  const [sortOpen, setSortOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [detail, setDetail] = useState<GithubPlugin | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [installedHere, setInstalledHere] = useState<Record<string, string>>({})
  const proxyQuery = useGithubProxyQuery()
  const proxy = proxyQuery.data
  const serverKey = `${appConfig.resolvedBaseUrl}${appConfig.basePath}`
  const query = useGithubDiscoveryQuery({ search: keyword, sort, proxy: proxy ?? '', refresh, enabled: !proxyQuery.isPending })
  const host = useDiscoveryHostVersion()
  const installed = usePluginsQuery()
  const install = useInstallFromRegistryMutation()
  const { initialOffset, onScroll } = useScrollMemory('github-discovery')
  const mountSearch = useRef(true)
  useEffect(() => {
    if (mountSearch.current) { mountSearch.current = false; return }
    const timer = setTimeout(() => setKeyword(search), 500)
    return () => clearTimeout(timer)
  }, [search])

  useBackHandler(detail !== null, () => { setDetail(null); return true })
  useBackHandler(sortOpen, () => { setSortOpen(false); return true })

  const pages = [...(query.data?.pages ?? [])]
  if (query.progress) pages[query.progress.page - 1] = query.progress.data
  const plugins = [...new Map(pages.flatMap(page => page.plugins).map(plugin => [plugin.repository.id, plugin])).values()]
  const checked = pages.reduce((sum, page) => sum + page.checked, 0)
  const failed = pages.reduce((sum, page) => sum + (page.failures.unavailable ?? 0) + (page.failures.rateLimited ?? 0), 0)
  const excluded = pages.reduce((sum, page) => sum + (page.failures.invalidManifest ?? 0) + (page.failures.invalidRelease ?? 0) + (page.failures.unpublished ?? 0), 0)
  const rateLimited = pages.some(page => page.failures.rateLimited) || query.error instanceof GithubDiscoveryError && query.error.reason === 'rateLimited'
  const retryAt = pages.find(page => page.retryAt)?.retryAt ?? (query.error instanceof GithubDiscoveryError ? query.error.retryAt : undefined)
  const compatibility = detail ? hostCompatibility(detail.manifest.minHostVersion, host.data) : 'compatible'
  const occupied = detail ? occupiedPlugin(detail, installed.data?.plugins ?? []) : undefined
  const sameRepository = detail ? installedFromRepository(detail, occupied) : false
  const hasUpdate = detail ? discoveryHasUpdate(detail, occupied) : false
  const installedVersion = detail ? installedHere[`${serverKey}:${detail.manifest.entryPath}`] : undefined
  const alreadyInstalled = detail != null && (installedVersion === `${detail.repository.id}:${detail.manifest.version}`
    || sameRepository && occupied?.version === detail.manifest.version)
  const canInstall = detail != null && compatibility === 'compatible' && installed.isSuccess && !install.isPending && !alreadyInstalled

  const goBack = () => {
    'background only'
    if (detail) setDetail(null)
    else if (onBack) onBack()
    else performRouteBack()
  }
  const doInstall = () => {
    'background only'
    if (!canInstall || !detail) return
    const plugin = detail
    setConfirmOpen(false)
    install.mutate({ downloadUrl: plugin.downloadUrl, githubProxy: proxy || undefined, overwrite: occupied != null }, {
      onSuccess: result => {
        if (result.success > 0) {
          updateRegistryReturnState(serverKey, plugin)
          setInstalledHere(previous => ({ ...previous, [`${serverKey}:${plugin.manifest.entryPath}`]: `${plugin.repository.id}:${plugin.manifest.version}` }))
          toast.success(result.message || t('jsplugin.installDone'))
        } else toast.error(result.results[0]?.error || result.message || t('githubDiscovery.installFailed'))
      },
      onError: error => toast.error(error instanceof Error ? error.message : String(error)),
    })
  }

  return (
    <SubPageShell
      title={detail ? detail.manifest.name : t('githubDiscovery.title')}
      onBack={goBack}
      backTestId='github-discovery-back'
      scrollable={false}
      contentClassName='plugin-registry__content'
      actions={(
        <view className='plugin-registry__topbar-actions'>
          {detail ? (
            <view className='plugin-registry__topbar-btn' bindtap={() => setDetail(null)} data-testid='github-detail-close' accessibility-element={true} accessibility-label={t('common.close')} accessibility-traits='button'>
              <Icon name='x' size={18} color={ICON_COLORS.content} />
            </view>
          ) : (
            <>
              <view className='plugin-registry__topbar-btn' bindtap={() => setHelpOpen(true)} data-testid='github-discovery-help' accessibility-element={true} accessibility-label={t('githubDiscovery.helpTitle')} accessibility-traits='button'>
                <Icon name='info' size={18} color={ICON_COLORS.content} />
              </view>
              <view className='plugin-registry__topbar-btn' bindtap={() => { if (!query.isFetching) setRefresh(value => value + 1) }} data-testid='github-discovery-refresh' accessibility-element={true} accessibility-label={t('common.refresh')} accessibility-traits='button'>
                <Icon name='refresh' size={18} color={ICON_COLORS.content} />
              </view>
            </>
          )}
        </view>
      )}
      overlay={(
        <>
          <ConfirmDialog show={helpOpen} title={t('githubDiscovery.helpTitle')} message={t('githubDiscovery.help')}
            acknowledgeOnly confirmLabel={t('common.close')} onConfirm={() => setHelpOpen(false)} onCancel={() => setHelpOpen(false)} testId='github-discovery-help-dialog' />
          <ConfirmDialog show={confirmOpen} title={t('githubDiscovery.installTitle')}
            message={t('githubDiscovery.installWarning', { repository: detail ? downloadRepository(detail) : '', version: detail?.manifest.version ?? '' })
              + (occupied && !sameRepository ? `\n\n${t('githubDiscovery.replaceWarning', { name: occupied.displayName, version: occupied.version ?? '' })}` : '')
              + `\n\n${t('githubDiscovery.permissions')}: ${detail?.manifest.permissions.join(', ') || t('githubDiscovery.noPermissions')}`}
            confirmLabel={occupied && !sameRepository ? t('jsplugin.conflictDialogConfirm') : t('jsplugin.install')}
            onConfirm={doInstall} onCancel={() => setConfirmOpen(false)} testId='github-install-dialog' confirmTestId='github-install-confirm' cancelTestId='github-install-cancel' />
        </>
      )}
    >
      <view className='plugin-registry__body'>
        {/* Keep the scroller mounted beneath the detail so its exact offset is retained. */}
        <view className={detail ? 'github-discovery__hidden' : 'github-discovery__list-body'}>
          <view className='github-discovery__notice'>
            <text className='github-discovery__notice-text'>{t('githubDiscovery.notice')}</text>
          </view>
          <view className='plugin-registry__search'>
            <Input className='plugin-registry__search-input' value={search} placeholder={t('githubDiscovery.search')} onInput={setSearch} />
            <PopoverMenu show={sortOpen} onShowChange={setSortOpen} placement='bottom-end' triggerClassName='github-discovery__sort'
              trigger={<text className='plugin-registry__retry-text' data-testid='github-discovery-sort'>{sort === 'stars' ? t('githubDiscovery.stars') : t('githubDiscovery.updated')}</text>}
              items={[{ key: 'updated', label: t('githubDiscovery.updated'), selected: sort === 'updated' }, { key: 'stars', label: t('githubDiscovery.stars'), selected: sort === 'stars' }]}
              onSelect={key => { setSort(key === 'stars' ? 'stars' : 'updated'); setSortOpen(false) }} />
          </view>
          <scroll-view className='plugin-registry__scroll' scroll-orientation='vertical' initial-scroll-offset={initialOffset} bindscroll={onScroll} data-testid='github-discovery-scroll'>
            {query.isFetching && !query.isFetchingNextPage ? <text className='github-discovery__status'>{t('jsplugin.loadingList')}</text> : null}
            {query.isError || rateLimited ? (
              <view className='github-discovery__notice'>
                <text className='github-discovery__notice-text'>{rateLimited ? t('githubDiscovery.rateLimited') : t(discoveryErrorKey(query.error))}</text>
                {retryAt ? <text className='github-discovery__meta'>{t('githubDiscovery.retryAt', { time: new Date(retryAt).toLocaleString() })}</text> : null}
                <view className='plugin-registry__retry-btn' bindtap={() => { if (!query.isFetching) setRefresh(value => value + 1) }} data-testid='github-discovery-retry'>
                  <text className='plugin-registry__retry-text'>{t('common.retry')}</text>
                </view>
              </view>
            ) : null}
            {plugins.map(plugin => (
              <view className='github-discovery__card' key={String(plugin.repository.id)} bindtap={() => setDetail(plugin)} data-testid={`github-plugin-${plugin.repository.id}`} accessibility-element={true} accessibility-traits='button' accessibility-label={plugin.manifest.name}>
                <text className='plugin-registry__item-name'>{plugin.manifest.name}</text>
                <text className='github-discovery__meta'>{plugin.repository.fullName}</text>
                {plugin.manifest.description ? <text className='github-discovery__description github-discovery__description--clamped' text-maxline='2'>{plugin.manifest.description}</text> : null}
                <text className='github-discovery__meta'>{`v${plugin.manifest.version} · ${plugin.manifest.renderEngine || 'webview'} · ★ ${plugin.repository.stars}`}</text>
                {installedFromRepository(plugin, occupiedPlugin(plugin, installed.data?.plugins ?? [])) ? <text className='github-discovery__meta'>{discoveryHasUpdate(plugin, occupiedPlugin(plugin, installed.data?.plugins ?? [])) ? t('githubDiscovery.updateAvailable') : t('githubDiscovery.installed')}</text> : null}
                <text className='plugin-registry__retry-text'>{t('githubDiscovery.details')}</text>
              </view>
            ))}
            {!query.isPending && !query.isError && plugins.length === 0 ? <text className='github-discovery__status'>{failed || rateLimited ? t('githubDiscovery.pending') : t('githubDiscovery.empty')}</text> : null}
            {pages.length ? <text className='github-discovery__status'>{t('githubDiscovery.summary', { checked, found: plugins.length, excluded, failed })}</text> : null}
            {pages.some(page => page.incomplete) ? <text className='github-discovery__status'>{t('githubDiscovery.incomplete')}</text> : null}
            {query.hasNextPage ? (
              <view className='github-discovery__load-more' bindtap={() => { if (!query.isFetching) void query.fetchNextPage() }} data-testid='github-discovery-more'>
                <text className='plugin-registry__retry-text'>{query.isFetchingNextPage ? t('common.loading') : t('githubDiscovery.loadMore')}</text>
              </view>
            ) : null}
            <view className='plugin-registry__nav-inset' />
          </scroll-view>
        </view>
        {detail ? (
          <scroll-view className='plugin-registry__scroll' scroll-orientation='vertical' data-testid='github-plugin-detail'>
            <view className='github-discovery__detail'>
              <text className='github-discovery__notice-text'>{t('githubDiscovery.notice')}</text>
              <text className='github-discovery__meta'>{detail.repository.fullName}</text>
              <text className='github-discovery__meta'>{detail.downloadUrl}</text>
              <text className='github-discovery__description'>{detail.manifest.description}</text>
              <text className='github-discovery__meta'>{`v${detail.manifest.version} · ${detail.manifest.renderEngine || 'webview'} · ★ ${detail.repository.stars}`}</text>
              <text className='github-discovery__meta'>{t('githubDiscovery.published', { date: detail.publishedAt.slice(0, 10) })}</text>
              {detail.manifest.minHostVersion ? <text className='github-discovery__meta'>{t('githubDiscovery.minimumHost', { version: detail.manifest.minHostVersion })}</text> : null}
              <text className='plugin-registry__item-name'>{t('githubDiscovery.permissions')}</text>
              <text className='github-discovery__description'>{detail.manifest.permissions.join(', ') || t('githubDiscovery.noPermissions')}</text>
              <view className='github-discovery__links'>
                <view className='plugin-registry__retry-btn' bindtap={() => openURL(`https://github.com/${detail.repository.fullName}`)} data-testid='github-plugin-source'><text className='plugin-registry__retry-text'>{t('githubDiscovery.source')}</text></view>
                <view className='plugin-registry__retry-btn' bindtap={() => openURL(detail.releaseUrl)} data-testid='github-plugin-release'><text className='plugin-registry__retry-text'>{t('githubDiscovery.release')}</text></view>
              </view>
              {occupied && !sameRepository && !alreadyInstalled ? <text className='github-discovery__notice-text'>{t('githubDiscovery.replaceWarning', { name: occupied.displayName, version: occupied.version ?? '' })}</text> : null}
              {compatibility === 'incompatible' ? <text className='github-discovery__notice-text'>{t('githubDiscovery.incompatible')}</text> : compatibility === 'unknown' ? <view bindtap={() => { void host.refetch() }}><text className='plugin-registry__retry-text'>{t('githubDiscovery.hostUnknown')}</text></view> : null}
              {!installed.isSuccess ? <view bindtap={() => { void installed.refetch() }}><text className='plugin-registry__retry-text'>{t('githubDiscovery.installedUnknown')}</text></view> : null}
              <view className={canInstall ? 'plugin-registry__install-btn' : 'plugin-registry__installed'} bindtap={() => { if (canInstall) setConfirmOpen(true) }} data-testid='github-plugin-install' accessibility-element accessibility-traits='button'>
                <text className={canInstall ? 'plugin-registry__install-text' : 'plugin-registry__installed-text'}>{install.isPending ? t('common.loading') : alreadyInstalled ? t('githubDiscovery.installed') : hasUpdate ? t('githubDiscovery.updateTo', { version: detail.manifest.version }) : sameRepository ? t('jsplugin.reinstall') : t('jsplugin.install')}</text>
              </view>
            </view>
            <view className='plugin-registry__nav-inset' />
          </scroll-view>
        ) : null}
      </view>
    </SubPageShell>
  )
}
