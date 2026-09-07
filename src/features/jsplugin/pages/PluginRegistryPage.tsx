import { useEffect, useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import { toast } from '../../../shared/ui/toast-store.js'
import type { RegistryPluginEntry } from '../../../models/jsplugin.js'
import { getJSPluginApi } from '../api/index.js'
import type { PluginRegistryConfig } from '../api/index.js'
import { useGithubProxyQuery } from '../data/jsplugin-query.js'
import { useInstallFromRegistryMutation } from '../data/jsplugin-mutations.js'
import { SubPageShell } from '../../settings/widgets/SubPageShell.js'
import { RegistryIcon } from '../widgets/RegistryIcon.js'
import { RegistryManageDialog } from '../widgets/RegistryManageDialog.js'
import './PluginRegistryPage.css'

/** Sentinel for the aggregated "all sources" picker entry. */
const ALL_SOURCES = '__all_sources__'

export function PluginRegistryPage({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation()
  const installMutation = useInstallFromRegistryMutation()
  const { data: githubProxy } = useGithubProxyQuery()

  const [registries, setRegistries] = useState<PluginRegistryConfig[]>([])
  const [loadingRegistries, setLoadingRegistries] = useState(true)
  /** The selected single source's URL; null = the aggregated "all" mode. */
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plugins, setPlugins] = useState<RegistryPluginEntry[]>([])
  const [total, setTotal] = useState(0)
  const [warnings, setWarnings] = useState<string[]>([])
  const [warningsOpen, setWarningsOpen] = useState(false)
  const pageSize = 20

  /** The row currently installing/reinstalling (rowKey); null = none. */
  const [installingKey, setInstallingKey] = useState<string | null>(null)
  /** The conflict entry awaiting the "replace" confirmation; null = closed. */
  const [confirmConflict, setConfirmConflict] = useState<RegistryPluginEntry | null>(null)

  const selected = selectedUrl != null
    ? registries.find((r) => r.url === selectedUrl)
    : undefined

  /**
   * The one listing fetch, with the source mode passed **explicitly** — the
   * state-flip race means a callback that just selected a source cannot read
   * `selectedUrl` yet.
   */
  const fetchList = (
    p: number,
    keyword: string,
    mode: { allSources: boolean, url?: string, token?: string },
    opts: { force?: boolean } = {},
  ) => {
    setLoading(true)
    setError(null)
    void getJSPluginApi()
      .refreshRegistry({
        allSources: mode.allSources,
        registryUrl: mode.url,
        // "All" mode resolves each source's token server-side; a single private
        // source carries its own.
        token: mode.token,
        page: p,
        pageSize,
        search: keyword || undefined,
        force: opts.force,
        githubProxy: githubProxy || undefined,
      })
      .then((res) => {
        setPlugins(res.plugins)
        setTotal(res.total)
        setPage(res.page)
        setWarnings(res.warnings)
      })
      .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)))
      .finally(() => setLoading(false))
  }

  const currentMode = () => {
    const allSources = selectedUrl == null
    return {
      allSources,
      url: allSources ? undefined : (selectedUrl ?? undefined),
      token: allSources ? undefined : (selected?.token || undefined),
    }
  }

  const doFetch = (p: number, keyword: string, opts: { force?: boolean } = {}) => {
    fetchList(p, keyword, currentMode(), opts)
  }

  /*
   * Boot: the listing and the source list load **in parallel**, started from
   * the render body the same way the pre-rewrite page did. That is not just
   * style: in the ReactLynx test environment an async setState chain that is
   * *started from an effect fired by an earlier async setState* never lands in
   * the serialized element tree (verified with a two-layer repro), and the
   * first listing would silently stay on its loading frame. The initial
   * listing defaults to "all sources" — exactly what Flutter's default
   * selection is — so it never needs the registries answer to start.
   */
  const [didInit, setDidInit] = useState(false)
  if (!didInit) {
    setDidInit(true)
    doFetch(1, '')
    void getJSPluginApi().getPluginRegistries()
      .then((list) => {
        setRegistries(list)
        setLoadingRegistries(false)
      })
      .catch(() => setLoadingRegistries(false))
  }
  const bootedRef = useRef(true)

  // Search debounces to a listing fetch (never forced: paging and searching
  // slice the server's cached tree). The mount run is skipped: the boot fetch
  // already owns the initial listing, and a mount-time timer would fire a
  // redundant refetch half a second later.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchMountedRef = useRef(false)
  useEffect(() => {
    if (!searchMountedRef.current) {
      searchMountedRef.current = true
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (bootedRef.current) doFetch(1, search)
    }, 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyword only; re-running on source flip would double-fetch
  }, [search])

  const onForceRefresh = () => {
    if (!loading) doFetch(page, search, { force: true })
  }

  const onSourceSelected = (url: string) => {
    const allSources = url === ALL_SOURCES
    const source = registries.find((r) => r.url === url)
    setSelectedUrl(allSources ? null : url)
    setPlugins([])
    setWarnings([])
    fetchList(1, search, {
      allSources,
      url: allSources ? undefined : url,
      token: allSources ? undefined : (source?.token || undefined),
    })
  }

  /**
   * Install success updates the rows **in place** (the whole listing is a
   * server-cached snapshot; refetching would flash and lose scroll position).
   * Matching is (entryPath, identity) — entry_path alone lights up another
   * author's same-named entry too (songloft-org/songloft#339), and those
   * neighbours flip to "conflict" because the local plugin they would clash
   * with is now the one just installed.
   */
  const markInstalled = (installed: RegistryPluginEntry) => {
    setPlugins((list) => list.map((p) => {
      if (p.entryPath === installed.entryPath && (p.identity ?? '') === (installed.identity ?? '')) {
        return {
          ...p,
          installed: true,
          installedVersion: installed.version,
          hasUpdate: false,
          conflict: false,
          conflictWith: undefined,
        }
      }
      if (p.entryPath === installed.entryPath) {
        return {
          ...p,
          installed: false,
          conflict: true,
          conflictWith: installed.name
            + (installed.author ? `（${installed.author}）` : '')
            + ` v${installed.version}`,
        }
      }
      return p
    }))
  }

  const onInstall = (entry: RegistryPluginEntry, overwrite = false) => {
    // A conflicting entry replaces another author's plugin — that asks first.
    if (entry.conflict && !overwrite) {
      setConfirmConflict(entry)
      return
    }
    setConfirmConflict(null)
    setInstallingKey(rowKeyOf(entry))
    installMutation.mutate(
      {
        downloadUrl: entry.downloadUrl,
        sourceUrl: entry.sourceUrl,
        overwrite,
        githubProxy: githubProxy || undefined,
        // "All" mode cannot know which source the entry came from — its
        // sourceUrl lets the backend resolve that source's own token.
        token: selectedUrl != null ? (selected?.token || undefined) : undefined,
      },
      {
        onSuccess: (result) => {
          if (result.success > 0) {
            toast.success(result.message || t('jsplugin.installDone'))
            markInstalled(entry)
          } else if (result.results[0]?.error) {
            toast.error(result.results[0].error)
          } else {
            toast.error(t('jsplugin.installFailed', { error: result.message }))
          }
        },
        onError: (e: unknown) => toast.error(t('jsplugin.installFailed', {
          error: e instanceof Error ? e.message : String(e),
        })),
        onSettled: () => setInstallingKey(null),
      },
    )
  }

  /**
   * Return to the plugin manager. In the wide settings master–detail this page
   * sits in the right pane and `onBack` swaps the pane back in place; as a
   * standalone route (single-column) fall back to routing. Mirrors
   * `PluginManagerPage.onStore`.
   */
  const goBack = () => {
    if (onBack) {
      onBack()
    } else {
      performRouteBack()
    }
  }

  const enabledRegistries = registries.filter((r) => r.enabled !== false)
  const sourceItems: PopoverMenuItem[] = [
    { key: ALL_SOURCES, label: t('jsplugin.allSources'), selected: selectedUrl == null },
    ...enabledRegistries.map((r) => ({
      key: r.url,
      label: r.name || r.url,
      selected: selectedUrl === r.url,
    })),
  ]

  const hasNext = page * pageSize < total
  const hasPrev = page > 1

  // Back while nothing is armed follows the shell's normal route-back.
  useBackHandler(sourceMenuOpen, () => {
    setSourceMenuOpen(false)
    return true
  })

  return (
    <SubPageShell
      title={t('jsplugin.registryTitle')}
      onBack={goBack}
      backTestId='registry-back'
      // The search bar stays pinned above the results, so this page keeps its own
      // scroll container rather than letting the shell wrap everything.
      scrollable={false}
      actions={(
        <view className='plugin-registry__topbar-actions'>
          {registries.length > 0
            ? (
              <PopoverMenu
                show={sourceMenuOpen}
                onShowChange={setSourceMenuOpen}
                placement='bottom-end'
                triggerClassName='plugin-registry__topbar-btn'
                trigger={<Icon name='globe' size={18} color={ICON_COLORS.content} testId='registry-source-btn' />}
                items={sourceItems}
                onSelect={onSourceSelected}
              />
            )
            : null}
          <view
            className='plugin-registry__topbar-btn'
            bindtap={onForceRefresh}
            data-testid='registry-force-refresh'
          >
            <Icon name='refresh' size={18} color={ICON_COLORS.content} />
          </view>
          <view
            className='plugin-registry__topbar-btn'
            bindtap={() => setManageOpen(true)}
            data-testid='registry-manage-btn'
          >
            <Icon name='settings' size={18} color={ICON_COLORS.content} />
          </view>
        </view>
      )}
      overlay={(
        <>
          <ConfirmDialog
            show={confirmConflict != null}
            title={t('jsplugin.conflictDialogTitle')}
            message={t('jsplugin.conflictDialogBody', {
              entryPath: confirmConflict?.entryPath ?? '',
              plugin: confirmConflict?.conflictWith ?? '',
            })}
            confirmLabel={t('jsplugin.conflictDialogConfirm')}
            onConfirm={() => {
              const entry = confirmConflict
              setConfirmConflict(null)
              if (entry) onInstall(entry, true)
            }}
            onCancel={() => setConfirmConflict(null)}
            testId='registry-conflict-dialog'
            confirmTestId='registry-conflict-confirm'
            cancelTestId='registry-conflict-cancel'
          />
          <ConfirmDialog
            show={warningsOpen}
            title={t('jsplugin.registryWarningsTitle')}
            message={warnings.join('\n\n')}
            confirmLabel={t('common.close')}
            onConfirm={() => setWarningsOpen(false)}
            onCancel={() => setWarningsOpen(false)}
            testId='registry-warnings-dialog'
            confirmTestId='registry-warnings-close'
          />
          <RegistryManageDialog
            show={manageOpen}
            onClose={() => setManageOpen(false)}
            registries={registries}
            onSaved={(saved) => {
              setRegistries(saved)
              // A deleted/disabled selection falls back to "all" (or nothing).
              if (selectedUrl != null && !saved.some((r) => r.url === selectedUrl && r.enabled !== false)) {
                setSelectedUrl(null)
                bootedRef.current = true
                doFetch(1, search)
              }
            }}
          />
        </>
      )}
    >
      {loadingRegistries
        ? <RegistryState text={t('common.loading')} testId='registry-loading-registries' />
        : registries.length === 0
          ? (
            <view className='plugin-registry__empty' data-testid='registry-no-sources'>
              <text className='plugin-registry__empty-title'>{t('jsplugin.noRegistries')}</text>
              <text className='plugin-registry__empty-hint'>{t('jsplugin.noRegistriesHint')}</text>
              <view
                className='plugin-registry__install-btn'
                bindtap={() => setManageOpen(true)}
                data-testid='registry-add-source'
              >
                <text className='plugin-registry__install-text'>{t('jsplugin.addRegistry')}</text>
              </view>
            </view>
          )
          : (
            <view className='plugin-registry__body'>
              <view className='plugin-registry__search'>
                <Input
                  className='plugin-registry__search-input'
                  value={search}
                  placeholder={t('jsplugin.searchPlaceholder')}
                  onInput={(value: string) => setSearch(value)}
                />
              </view>

              {warnings.length > 0
                ? (
                  <view
                    className='plugin-registry__warnings'
                    bindtap={() => setWarningsOpen(true)}
                    data-testid='registry-warnings'
                  >
                    <Icon name='warning' size={16} color={ICON_COLORS.danger} />
                    <text className='plugin-registry__warnings-text'>
                      {t('jsplugin.registryWarningsSummary', { count: warnings.length })}
                    </text>
                    <Icon name='info' size={16} color={ICON_COLORS.contentMuted} />
                  </view>
                )
                : null}

              <scroll-view className='plugin-registry__scroll' scroll-y>
                {loading
                  ? <RegistryState text={t('jsplugin.loadingList')} testId='registry-loading' />
                  : error
                    ? (
                      <view className='plugin-registry__state'>
                        <text className='plugin-registry__state-text plugin-registry__state-text--error'>{error}</text>
                        <view
                          className='plugin-registry__retry-btn'
                          bindtap={onForceRefresh}
                          data-testid='registry-retry'
                        >
                          <text className='plugin-registry__retry-text'>{t('common.retry')}</text>
                        </view>
                      </view>
                    )
                    : plugins.length === 0
                      ? (
                        <RegistryState
                          text={search ? t('jsplugin.noMatch') : t('jsplugin.registryEmpty')}
                          testId='registry-empty'
                        />
                      )
                      : (
                        <view className='plugin-registry__list'>
                          {plugins.map((plugin) => (
                            <RegistryRow
                              key={rowKeyOf(plugin)}
                              entry={plugin}
                              installing={installingKey === rowKeyOf(plugin)}
                              onInstall={onInstall}
                            />
                          ))}
                        </view>
                      )}
                              <view className='plugin-registry__nav-inset' />
</scroll-view>

              {!loading && plugins.length > 0
                ? (
                  <view className='plugin-registry__pager'>
                    <view
                      className={hasPrev ? 'plugin-registry__page-btn' : 'plugin-registry__page-btn plugin-registry__page-btn--disabled'}
                      bindtap={() => { if (hasPrev) doFetch(page - 1, search) }}
                      data-testid='registry-prev'
                    >
                      <Icon name='chevron-down' size={16} color={hasPrev ? ICON_COLORS.content : ICON_COLORS.contentMuted} />
                    </view>
                    <text className='plugin-registry__page-text'>
                      {page} / {Math.ceil(total / pageSize) || 1}
                    </text>
                    <view
                      className={hasNext ? 'plugin-registry__page-btn' : 'plugin-registry__page-btn plugin-registry__page-btn--disabled'}
                      bindtap={() => { if (hasNext) doFetch(page + 1, search) }}
                      data-testid='registry-next'
                    >
                      <Icon name='chevron-up' size={16} color={hasNext ? ICON_COLORS.content : ICON_COLORS.contentMuted} />
                    </view>
                  </view>
                )
                : null}
            </view>
          )}
    </SubPageShell>
  )
}

/** Stable row identity: entry_path alone collides across authors (#339). */
function rowKeyOf(entry: RegistryPluginEntry): string {
  return `${entry.entryPath}|${entry.identity ?? ''}`
}

/**
 * One store row, mirroring the Flutter `_RegistryPluginItem`: icon, name,
 * author · source, a description line, a conflict warning line, and the four
 * action states (install / update-to / reinstall chip / overwrite).
 */
function RegistryRow({
  entry,
  installing,
  onInstall,
}: {
  entry: RegistryPluginEntry
  installing: boolean
  onInstall: (entry: RegistryPluginEntry, overwrite?: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <view className='plugin-registry__item'>
      <RegistryIcon entry={entry} />
      <view className='plugin-registry__item-info'>
        <text className='plugin-registry__item-name'>{entry.name}</text>
        {[entry.author, entry.sourceName].filter(Boolean).length > 0
          ? (
            <text className='plugin-registry__item-meta'>
              {[entry.author, entry.sourceName].filter(Boolean).join(' · ')}
            </text>
          )
          : null}
        {entry.description
          ? <text className='plugin-registry__item-desc'>{entry.description}</text>
          : null}
        {entry.conflict
          ? (
            <view className='plugin-registry__conflict-line'>
              <Icon name='warning' size={12} color={ICON_COLORS.danger} />
              <text className='plugin-registry__conflict-line-text'>
                {entry.conflictWith || t('jsplugin.conflictWarning')}
              </text>
            </view>
          )
          : null}
      </view>
      <view className='plugin-registry__item-action'>
        {installing
          ? (
            <view className='plugin-registry__installed' data-testid={`registry-installing-${entry.entryPath}`}>
              <text className='plugin-registry__installed-text'>{t('common.loading')}</text>
            </view>
          )
          : entry.installed && !entry.hasUpdate
            ? (
              /* The reinstall chip: the version it *would* land on, tapped to
                 land on it — Flutter's ActionChip(avatar: refresh, v{version}). */
              <view
                className='plugin-registry__reinstall'
                bindtap={() => onInstall(entry)}
                data-testid={`registry-reinstall-${entry.entryPath}`}
              >
                <Icon name='refresh' size={12} color={ICON_COLORS.contentMuted} />
                <text className='plugin-registry__reinstall-text'>
                  v{entry.installedVersion ?? entry.version}
                </text>
              </view>
            )
            : entry.installed && entry.hasUpdate
              ? (
                <view
                  className='plugin-registry__update-btn'
                  bindtap={() => onInstall(entry)}
                  data-testid={`registry-update-${entry.entryPath}`}
                >
                  <text className='plugin-registry__update-text'>
                    {t('jsplugin.updateTo', { version: entry.version })}
                  </text>
                </view>
              )
              : entry.conflict
                ? (
                  <view
                    className='plugin-registry__overwrite-btn'
                    bindtap={() => onInstall(entry)}
                    data-testid={`registry-install-${entry.entryPath}`}
                  >
                    <text className='plugin-registry__overwrite-text'>
                      {t('jsplugin.overwriteInstall')}
                    </text>
                  </view>
                )
                : (
                  <view
                    className='plugin-registry__install-btn'
                    bindtap={() => onInstall(entry)}
                    data-testid={`registry-install-${entry.entryPath}`}
                  >
                    <text className='plugin-registry__install-text'>{t('jsplugin.install')}</text>
                  </view>
                )}
      </view>
    </view>
  )
}

function RegistryState({ text, testId, tone }: { text: string; testId?: string; tone?: 'error' }) {
  return (
    <view className='plugin-registry__state' data-testid={testId}>
      <text
        className={tone === 'error'
          ? 'plugin-registry__state-text plugin-registry__state-text--error'
          : 'plugin-registry__state-text'}
      >
        {text}
      </text>
    </view>
  )
}
