import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { AppCheckbox } from '../../../shared/ui/AppCheckbox.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { openURL, pickAndUploadFile } from '../../../native/native-platform.js'
import { parseJSPluginUploadResponse } from '../../../models/jsplugin.js'
import type { JSPlugin, JSPluginUploadResponse } from '../../../models/jsplugin.js'
import {
  usePluginsQuery,
  usePluginKeepAliveQuery,
  useGithubProxyQuery,
  usePluginAutoUpdateQuery,
} from '../data/jsplugin-query.js'
import { getJSPluginApi } from '../api/index.js'
import { releasePluginFrame } from '../domain/plugin-frame-release.js'
import {
  useTogglePluginMutation,
  useDeletePluginMutation,
  useSetPluginKeepAliveMutation,
  useUpdatePluginMutation,
  useSetPluginAutoUpdateMutation,
} from '../data/jsplugin-mutations.js'
import { SubPageShell } from '../../settings/widgets/SubPageShell.js'
import { SwitchRow } from '../../settings/widgets/SwitchRow.js'
import { PluginAvatar } from '../widgets/PluginAvatar.js'
import { PluginUpdateDialog } from '../widgets/PluginUpdateDialog.js'
import { PluginBatchUpdateDialog } from '../widgets/PluginBatchUpdateDialog.js'
import './PluginManagerPage.css'

export function PluginManagerPage({ onOpenStore }: { onOpenStore?: () => void }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = usePluginsQuery()
  const plugins = data?.plugins ?? []
  const { data: keepAliveList } = usePluginKeepAliveQuery()
  const { data: autoUpdate, isLoading: autoUpdateLoading } = usePluginAutoUpdateQuery()

  const toggleMutation = useTogglePluginMutation()
  const deleteMutation = useDeletePluginMutation()
  const keepAliveMutation = useSetPluginKeepAliveMutation()
  const updatePluginMutation = useUpdatePluginMutation()
  const autoUpdateMutation = useSetPluginAutoUpdateMutation()
  const { data: githubProxy } = useGithubProxyQuery()
  const openingBlocked = toggleMutation.isPending
    || deleteMutation.isPending
    || updatePluginMutation.isPending

  /*
   * The dialog's visibility and its subject are separate state on purpose. Driving
   * `show` off `pendingDelete !== null` meant cancelling cleared the subject while
   * lynx-ui was still animating the panel out — so for the length of that
   * animation the dialog stayed on screen reading 「将删除「」…」 with an empty
   * name, which is what got reported as "cancel shows an extra screen".
   * The subject now outlives the close and is only replaced when the next delete
   * opens.
   */
  const [pendingDelete, setPendingDelete] = useState<JSPlugin | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  /** The delete dialog's "keep plugin data" checkbox (survives like the subject). */
  const [deleteKeepData, setDeleteKeepData] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  /** The plugin whose update-check dialog is open (null = closed). */
  const [updateTarget, setUpdateTarget] = useState<JSPlugin | null>(null)
  /** The plugin awaiting the force-update confirmation (null = closed). */
  const [forceConfirm, setForceConfirm] = useState(false)
  /** The force-update subject outlives the dialog, like `pendingDelete` does. */
  const [forceTarget, setForceTarget] = useState<JSPlugin | null>(null)
  /** The batch update dialog (confirm → running → results). */
  const [batchOpen, setBatchOpen] = useState(false)
  /** The cleanup confirmation dialog. */
  const [cleanupConfirm, setCleanupConfirm] = useState(false)
  /** A partially-failed upload's per-file details (null = all good / none). */
  const [uploadResult, setUploadResult] = useState<JSPluginUploadResponse | null>(null)

  const onToggle = (plugin: JSPlugin) => {
    const disabling = plugin.isActive
    toggleMutation.mutate(
      { id: plugin.id, enable: !plugin.isActive },
      {
        // A disabled plugin must stop running. Its Web frame survives tab
        // switches by design (see `plugin-frame-release.ts`), so this is one of
        // the few places that actually releases it.
        onSuccess: () => {
          if (disabling && plugin.entryPath) releasePluginFrame(plugin.entryPath)
        },
        onError: (e: unknown) => toast.error(String(e instanceof Error ? e.message : e)),
      },
    )
  }

  const onOpenPlugin = (plugin: JSPlugin) => {
    if (!plugin.isActive || !plugin.entryPath || openingBlocked) return
    void navigate({
      to: '/plugin/$entryPath',
      params: { entryPath: plugin.entryPath },
      search: { from: 'manager' },
    })
  }

  /**
   * Keep-alive pins an *active* plugin's **backend JS service** so it is not put
   * to sleep when idle (`internal/jsplugin/health.go` `checkIdle`), which is what
   * makes reopening its tab instant; the backend stores the entry_path whitelist,
   * so toggle = add/remove from it. Unrelated to the *frontend* frame keep-alive
   * in `web/webview-host.js` — that one is not user-configurable and exists to
   * avoid a renderer crash, not to warm anything up.
   */
  const onToggleKeepAlive = (plugin: JSPlugin) => {
    const entryPath = plugin.entryPath
    if (!entryPath) return
    const current = keepAliveList ?? []
    const next = current.includes(entryPath)
      ? current.filter((e) => e !== entryPath)
      : [...current, entryPath]
    keepAliveMutation.mutate(next, {
      onError: (e: unknown) => toast.error(String(e instanceof Error ? e.message : e)),
    })
  }

  /**
   * Uninstalling deletes the plugin's files; whether its stored data goes too is
   * the checkbox beside the confirm button, so this asks first.
   *
   * This used to be a two-tap confirm on the `×` glyph, whose entire armed-state
   * feedback was the 16px icon turning red — indistinguishable from a hover tint,
   * and reported as "there is no confirmation".
   */
  const onConfirmDelete = () => {
    const plugin = pendingDelete
    if (!plugin) return
    setDeleteOpen(false)
    deleteMutation.mutate(
      { id: plugin.id, keepData: deleteKeepData },
      {
        // The files are gone; the kept-alive frame must not keep running them.
        onSuccess: () => {
          if (plugin.entryPath) releasePluginFrame(plugin.entryPath)
        },
        onError: (e: unknown) => toast.error(String(e instanceof Error ? e.message : e)),
      },
    )
  }

  /**
   * Force update skips the version check and reinstalls, which is why it asks
   * first (a misc tap re-downloads the plugin for nothing). The GitHub proxy
   * rides along like every other update path.
   */
  const onConfirmForceUpdate = () => {
    const plugin = forceTarget
    if (!plugin) return
    setForceConfirm(false)
    updatePluginMutation.mutate(
      {
        id: plugin.id,
        force: true,
        ...(githubProxy ? { githubProxy } : {}),
      },
      {
        onSuccess: () => {
          // Reinstall replaced the plugin's files — a kept-alive frame would keep
          // serving the old build until something else navigated it.
          if (plugin.entryPath) releasePluginFrame(plugin.entryPath)
          toast.success(t('jsplugin.forceUpdateSuccess'))
        },
        onError: (e: unknown) =>
          toast.error(t('jsplugin.forceUpdateFailed', {
            error: e instanceof Error ? e.message : String(e),
          })),
      },
    )
  }

  /** Clean up storage no installed plugin owns — destructive, so it asks first. */
  const onConfirmCleanup = () => {
    setCleanupConfirm(false)
    void getJSPluginApi().cleanupOrphanStorage()
      .then((message) => toast.success(message || t('jsplugin.cleanupDone')))
      .catch((e: unknown) =>
        toast.error(t('jsplugin.cleanupFailed', {
          error: e instanceof Error ? e.message : String(e),
        })))
  }

  /**
   * Open the plugin store. In the wide settings master–detail this page sits in
   * the right pane and `onOpenStore` swaps the pane to the registry in place —
   * a route navigation would unmount SettingsPage and drop the settings list. As
   * a standalone route (single-column) there is no pane, so fall back to routing.
   */
  const onStore = () => {
    if (onOpenStore) {
      onOpenStore()
    } else {
      navigate({ to: '/settings/plugins/registry' })
    }
  }

  const onInstallFromFile = async () => {
    if (installing) return
    setInstalling(true)
    try {
      const uploadUrl = getJSPluginApi().getUploadUrl()
      const body = await pickAndUploadFile(uploadUrl, 'plugin', 'application/zip')
      void refetch()
      // Same reason the install mutation invalidates it: an uploaded plugin
      // can bring a configured tab back to the nav bar.
      void queryClient.invalidateQueries({ queryKey: ['settings', 'tab-config'] })
      /*
       * The uploader hands back the endpoint's JSON. All-success is a toast;
       * partial failure gets the per-file details in a dialog — a single toast
       * line cannot say which of several zipped plugins failed and why. A body
       * that is not the expected shape (older server, empty string) stays silent:
       * the refreshed list is already the feedback.
       */
      let parsed: JSPluginUploadResponse | null = null
      try {
        parsed = parseJSPluginUploadResponse(JSON.parse(body))
      } catch {
        parsed = null
      }
      if (parsed && parsed.failed > 0) {
        setUploadResult(parsed)
      } else if (parsed && parsed.success > 0) {
        toast.success(parsed.message || t('jsplugin.uploadSuccess', { count: parsed.success }))
      }
    } catch (e: unknown) {
      /*
       * Never swallow this. The upload URL used to be a bare relative path with no
       * credentials, so the POST was a guaranteed 401 on every platform — and
       * because the failure landed in an empty `catch`, the button simply did
       * nothing, which is exactly how it was reported. Cancelling is not an error.
       */
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== 'cancelled') toast.error(msg || t('jsplugin.installFailed'))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <SubPageShell
      title={t('jsplugin.managerTitle')}
      backTestId='plugins-back'
      /*
       * These three actions used to sit here as labelled pills, which filled
       * the whole row on a small screen — and the `flex: 1` title yields first,
       * so「插件管理」wrapped onto two lines. One overflow glyph keeps the topbar
       * at back + title + 40px at any width, in either locale (the English
       * labels are wider still: "Install from file" / "Store" / "Update all").
       */
      actions={(
        <PopoverMenu
          show={menuOpen}
          onShowChange={setMenuOpen}
          placement='bottom-end'
          triggerClassName='plugin-manager__more-btn'
          trigger={<Icon name='more' size={20} color={ICON_COLORS.content} />}
          items={[
            {
              key: 'install',
              label: installing ? t('common.loading') : t('jsplugin.installFromFile'),
            },
            { key: 'store', label: t('jsplugin.store') },
            { key: 'update-all', label: t('jsplugin.updateAll') },
            { key: 'cleanup', label: t('jsplugin.cleanupData') },
          ]}
          onSelect={(key) => {
            if (key === 'install') void onInstallFromFile()
            else if (key === 'store') onStore()
            // The batch dialog owns the run and its results; it opens from here.
            else if (key === 'update-all') setBatchOpen(true)
            else if (key === 'cleanup') setCleanupConfirm(true)
          }}
        />
      )}
      overlay={(
        <>
          <ConfirmDialog
            show={deleteOpen}
            title={t('jsplugin.uninstallTitle')}
            message={t('jsplugin.uninstallMessage', { name: pendingDelete?.displayName ?? '' })}
            confirmLabel={t('jsplugin.uninstallConfirm')}
            onConfirm={onConfirmDelete}
            onCancel={() => setDeleteOpen(false)}
            testId='plugin-delete-dialog'
            confirmTestId='plugin-delete-confirm'
            cancelTestId='plugin-delete-cancel'
          >
            <view
              className='plugin-manager__keep-data'
              data-testid='plugin-keep-data'
              bindtap={() => setDeleteKeepData((v) => !v)}
            >
              <AppCheckbox checked={deleteKeepData} />
              <view className='plugin-manager__keep-data-texts'>
                <text className='plugin-manager__keep-data-label'>{t('jsplugin.keepData')}</text>
                <text className='plugin-manager__keep-data-hint'>{t('jsplugin.keepDataHint')}</text>
              </view>
            </view>
          </ConfirmDialog>
          <PluginUpdateDialog
            show={updateTarget != null}
            plugin={updateTarget}
            onClose={() => setUpdateTarget(null)}
          />
          <PluginBatchUpdateDialog
            show={batchOpen}
            onClose={() => setBatchOpen(false)}
            githubProxy={githubProxy}
          />
          <ConfirmDialog
            show={forceConfirm}
            title={t('jsplugin.forceUpdateTitle', { name: forceTarget?.displayName ?? '' })}
            message={t('jsplugin.forceUpdateContent')}
            confirmLabel={t('jsplugin.forceUpdateConfirm')}
            onConfirm={onConfirmForceUpdate}
            onCancel={() => setForceConfirm(false)}
            testId='plugin-force-dialog'
            confirmTestId='plugin-force-confirm'
            cancelTestId='plugin-force-cancel'
          />
          <ConfirmDialog
            show={cleanupConfirm}
            title={t('jsplugin.cleanupOrphanTitle')}
            message={t('jsplugin.cleanupOrphanContent')}
            confirmLabel={t('jsplugin.cleanupConfirm')}
            onConfirm={onConfirmCleanup}
            onCancel={() => setCleanupConfirm(false)}
            testId='plugin-cleanup-dialog'
            confirmTestId='plugin-cleanup-confirm'
            cancelTestId='plugin-cleanup-cancel'
          />
          <ConfirmDialog
            show={uploadResult != null}
            title={t('jsplugin.uploadResultTitle')}
            message={uploadResult != null
              ? t('jsplugin.uploadPartial', { success: uploadResult.success, failed: uploadResult.failed })
                + '\n'
                + uploadResult.results
                  .filter((r) => !r.success)
                  .map((r) => `${r.fileName}: ${r.error ?? ''}`)
                  .join('\n')
              : ''}
            confirmLabel={t('common.close')}
            acknowledgeOnly
            onConfirm={() => setUploadResult(null)}
            onCancel={() => setUploadResult(null)}
            testId='plugin-upload-result'
            confirmTestId='plugin-upload-result-close'
          />
        </>
      )}
    >
      {/*
       * The auto-update switch mirrors the Flutter manager's SwitchListTile —
       * a page-level setting, so it stays put across the list's loading states.
       */}
      <view className='plugin-manager__auto-update'>
        <SwitchRow
          title={t('jsplugin.autoUpdate')}
          subtitle={t('jsplugin.autoUpdateHint')}
          checked={autoUpdate === true}
          disabled={autoUpdateLoading || autoUpdateMutation.isPending}
          onChange={(enabled) => autoUpdateMutation.mutate(enabled, {
            onError: (e: unknown) => toast.error(String(e instanceof Error ? e.message : e)),
          })}
          testId='plugin-auto-update'
        />
      </view>
      {isLoading
        ? <PluginState text={t('common.loading')} testId='plugins-loading' />
        : isError
          ? <PluginState text={t('jsplugin.loadError')} testId='plugins-error' tone='error' />
          : plugins.length === 0
            ? <PluginState text={t('jsplugin.noPlugins')} testId='plugins-empty' />
            : (
              <view className='plugin-manager__list'>
                {plugins.map((plugin) => (
                  <PluginRow
                    key={String(plugin.id)}
                    plugin={plugin}
                    keepAlive={keepAliveList ?? []}
                    onOpen={onOpenPlugin}
                    openingBlocked={openingBlocked}
                    onToggleActive={onToggle}
                    onToggleKeepAlive={onToggleKeepAlive}
                    onCheckUpdate={setUpdateTarget}
                    onForceUpdate={(p) => {
                      setForceTarget(p)
                      setForceConfirm(true)
                    }}
                    onRequestDelete={(p) => {
                      setPendingDelete(p)
                      setDeleteKeepData(false)
                      setDeleteOpen(true)
                    }}
                  />
                ))}
              </view>
            )}
    </SubPageShell>
  )
}

/**
 * One installed plugin, mirroring the Flutter manager's `_JSPluginItem`: avatar
 * with a status ring, name + version + author, a two-line description, the
 * enable switch, and an overflow menu (homepage / keep-alive / delete).
 */
function PluginRow({
  plugin,
  keepAlive,
  onOpen,
  openingBlocked,
  onToggleActive,
  onToggleKeepAlive,
  onCheckUpdate,
  onForceUpdate,
  onRequestDelete,
}: {
  plugin: JSPlugin
  keepAlive: string[]
  onOpen: (plugin: JSPlugin) => void
  openingBlocked: boolean
  onToggleActive: (plugin: JSPlugin) => void
  onToggleKeepAlive: (plugin: JSPlugin) => void
  onCheckUpdate: (plugin: JSPlugin) => void
  onForceUpdate: (plugin: JSPlugin) => void
  onRequestDelete: (plugin: JSPlugin) => void
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const isKeepAlive = plugin.entryPath != null && keepAlive.includes(plugin.entryPath)
  const canOpen = plugin.isActive && Boolean(plugin.entryPath) && !openingBlocked

  const tone = plugin.isError ? 'error' : plugin.isActive ? 'active' : 'inactive'
  const statusLabel = plugin.isError
    ? t('jsplugin.statusError')
    : plugin.isActive
      ? t('jsplugin.statusEnabled')
      : t('jsplugin.statusDisabled')

  const items: PopoverMenuItem[] = [
    ...(plugin.homepage ? [{ key: 'homepage', label: t('jsplugin.openHomepage') }] : []),
    ...(plugin.isActive
      ? [{ key: 'keep-alive', label: t('jsplugin.keepAlive'), selected: isKeepAlive }]
      : []),
    { key: 'check-update', label: t('jsplugin.checkUpdate') },
    { key: 'force-update', label: t('jsplugin.forceUpdate') },
    { key: 'delete', label: t('jsplugin.uninstallConfirm'), danger: true },
  ]

  return (
    <view className='plugin-manager__item' data-testid={`plugin-item-${plugin.id}`}>
      <view className='plugin-manager__row-main'>
        <view
          className='plugin-manager__entry'
          data-testid={`plugin-entry-${plugin.id}`}
          bindtap={canOpen ? () => onOpen(plugin) : undefined}
          accessibility-element={canOpen}
          accessibility-traits={canOpen ? 'button' : undefined}
          accessibility-label={canOpen ? plugin.displayName : undefined}
        >
          <PluginAvatar plugin={plugin} />
          <view className='plugin-manager__item-info'>
            <text className='plugin-manager__item-name'>{plugin.displayName}</text>
            <view className='plugin-manager__item-meta'>
              <view className={`plugin-manager__status plugin-manager__status--${tone}`}>
                <view className='plugin-manager__status-dot' />
                <text className='plugin-manager__status-text'>{statusLabel}</text>
              </view>
              {plugin.version
                ? <text className='plugin-manager__version'>v{plugin.version}</text>
                : null}
              {plugin.author
                ? <text className='plugin-manager__author'>{t('jsplugin.author', { author: plugin.author })}</text>
                : null}
            </view>
            {plugin.description
              ? (
                <text className='plugin-manager__desc' text-maxline='2'>
                  {plugin.description}
                </text>
              )
              : null}
          </view>
          {canOpen ? <Icon name='chevron-right' size={18} color={ICON_COLORS.contentMuted} /> : null}
        </view>
        <view className='plugin-manager__item-actions'>
          <AppSwitch checked={plugin.isActive} onChange={() => onToggleActive(plugin)} />
          <PopoverMenu
            show={menuOpen}
            onShowChange={setMenuOpen}
            placement='bottom-end'
            triggerClassName='plugin-manager__row-more'
            trigger={<Icon name='more' size={18} color={ICON_COLORS.contentMuted} testId={`plugin-more-${plugin.id}`} />}
            items={items}
            onSelect={(key) => {
              if (key === 'homepage' && plugin.homepage) openURL(plugin.homepage)
              else if (key === 'keep-alive') onToggleKeepAlive(plugin)
              else if (key === 'check-update') onCheckUpdate(plugin)
              else if (key === 'force-update') onForceUpdate(plugin)
              else if (key === 'delete') onRequestDelete(plugin)
            }}
          />
        </view>
      </view>
    </view>
  )
}

function PluginState({ text, testId, tone }: { text: string; testId?: string; tone?: 'error' }) {
  return (
    <view className='plugin-manager__state' data-testid={testId}>
      <text
        className={tone === 'error'
          ? 'plugin-manager__state-text plugin-manager__state-text--error'
          : 'plugin-manager__state-text'}
      >
        {text}
      </text>
    </view>
  )
}
