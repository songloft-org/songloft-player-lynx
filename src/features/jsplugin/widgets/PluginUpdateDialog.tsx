import { useEffect, useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import {
  DialogRoot,
  DialogView,
  DialogBackdrop,
  DialogContent,
} from '@lynx-js/lynx-ui-dialog'

import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { HttpTimeoutError } from '../../../core/network/http-client.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { getJSPluginApi } from '../api/index.js'
import { useGithubProxyQuery } from '../data/jsplugin-query.js'
import { useUpdatePluginMutation } from '../data/jsplugin-mutations.js'
import type { JSPlugin, JSPluginUpdateCheck } from '../../../models/jsplugin.js'
// The dialog chrome (card, scrim, buttons) is ConfirmDialog's — including the
// z-index levels its overlay contract test pins. Only the body and the dynamic
// action row are specific to the update flow.
import { BackdropBlur } from '../../../shared/ui/BackdropBlur.js'
import {
  DIALOG_WIDTH_PX,
  dialogCardWidth,
  dialogCardMaxHeight,
  dialogContentMaxHeight,
} from '../../../shared/ui/dialog-viewport.js'
import '../../../shared/ui/ConfirmDialog.css'
import './PluginUpdateDialog.css'

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export interface PluginUpdateDialogProps {
  show: boolean
  /** The plugin being checked; kept nullable so the owner can close by clearing it. */
  plugin: JSPlugin | null
  onClose: () => void
}

/**
 * The single-plugin update flow, mirroring Flutter's `_JSPluginUpdateDialog`:
 * open → auto check → result ("already latest" or `v1 → v2`) → update now.
 * The API owns the check/update deadlines; updates cannot be closed mid-run.
 *
 * The GitHub proxy comes from the shared settings query and is forwarded to both
 * endpoints when set — the download often needs it to be reachable at all.
 */
export function PluginUpdateDialog({ show, plugin, onClose }: PluginUpdateDialogProps) {
  const { t } = useTranslation()
  const { data: githubProxy } = useGithubProxyQuery()
  const updatePluginMutation = useUpdatePluginMutation()

  type Phase = 'checking' | 'result' | 'updating'
  const [phase, setPhase] = useState<Phase>('checking')
  const [check, setCheck] = useState<JSPluginUpdateCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const proxyParams = githubProxy ? { githubProxy } : {}

  const runCheck = async () => {
    if (!plugin) return
    const requestId = ++requestIdRef.current
    setPhase('checking')
    setError(null)
    setCheck(null)
    try {
      const res = await getJSPluginApi().checkUpdate(plugin.id, proxyParams)
      if (requestId !== requestIdRef.current) return
      setCheck(res)
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      setError(e instanceof HttpTimeoutError
        ? t('jsplugin.checkUpdateTimeout')
        : t('jsplugin.checkUpdateFailed', { error: errorMessage(e) }))
    } finally {
      if (requestId === requestIdRef.current) setPhase('result')
    }
  }

  const runUpdate = async () => {
    if (!plugin) return
    const requestId = ++requestIdRef.current
    setPhase('updating')
    setError(null)
    try {
      await updatePluginMutation.mutateAsync({ id: plugin.id, ...proxyParams })
      if (requestId !== requestIdRef.current) return
      toast.success(t('jsplugin.updateSuccess'))
      onClose()
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      setError(e instanceof HttpTimeoutError
        ? t('jsplugin.updateTimeout')
        : t('jsplugin.updateFailed', { error: errorMessage(e) }))
      setPhase('result')
    }
  }

  // Every open starts a fresh check. Invalidate earlier requests on close and
  // recheck so a late result cannot overwrite a newer dialog's state.
  useEffect(() => {
    if (!show || !plugin) return
    void runCheck()
    return () => {
      ++requestIdRef.current
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per open, not per proxy flip
  }, [show, plugin?.id])

  // Back closes — except mid-update, where closing would read as "it finished".
  useBackHandler(show, () => {
    if (phase === 'updating') return true
    onClose()
    return true
  })

  const requestClose = () => {
    if (phase === 'updating') return
    onClose()
  }

  return (
    <DialogRoot show={show} onShowChange={(open: boolean) => { if (!open) requestClose() }}>
      <DialogView className='confirm-dialog__view'>
        <DialogBackdrop
          className='confirm-dialog__backdrop'
          transition
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          clickToClose
        >
          {/* Real backdrop blur, behind the dim so the page is blurred and then
              darkened. Same five-piece chrome as `ConfirmDialog`, whose stylesheet
              this dialog reuses — so it needs the blur for the same reason. */}
          <BackdropBlur />
          <view className='confirm-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent
          className='confirm-dialog__content'
          transition
          dialogContentProps={{ bindtap: requestClose }}
        >
          <view
            className='confirm-dialog plugin-update'
            data-testid='plugin-update-dialog'
            catchtap={() => {}}
            style={{ width: dialogCardWidth(DIALOG_WIDTH_PX), maxHeight: dialogCardMaxHeight() }}
          >
            <text className='confirm-dialog__title' text-maxline='2'>
              {t('jsplugin.updateDialogTitle', { name: plugin?.displayName ?? '' })}
            </text>
            <scroll-view
              className='confirm-dialog__body'
              scroll-y
              style={{ maxHeight: dialogContentMaxHeight() }}
            >
              {phase === 'checking'
                ? <text className='plugin-update__phase'>{t('jsplugin.checkingUpdate')}</text>
                : null}

              {phase === 'updating'
                ? (
                  <view className='plugin-update__updating'>
                    <text className='plugin-update__phase'>{t('jsplugin.downloadingUpdate')}</text>
                    <text className='plugin-update__hint'>{t('jsplugin.doNotClose')}</text>
                  </view>
                )
                : null}

              {phase === 'result' && error != null
                ? (
                  <view className='plugin-update__error' data-testid='plugin-update-error'>
                    <text className='plugin-update__error-text'>{error}</text>
                  </view>
                )
                : null}

              {phase === 'result' && error == null && check != null
                ? (
                  check.hasUpdate
                    ? (
                      <view className='plugin-update__found' data-testid='plugin-update-found'>
                        <text className='plugin-update__found-label'>{t('jsplugin.newVersionFound')}</text>
                        <text className='plugin-update__versions'>
                          v{check.currentVersion} → v{check.remoteVersion}
                        </text>
                      </view>
                    )
                    : (
                      <view className='plugin-update__found'>
                        <text className='plugin-update__found-label'>{t('jsplugin.alreadyLatest')}</text>
                        <text className='plugin-update__versions'>
                          {t('jsplugin.currentVersion', { version: check.currentVersion })}
                        </text>
                      </view>
                    )
                )
                : null}
            </scroll-view>
            {phase !== 'updating'
              ? (
                <view className='confirm-dialog__actions'>
                  <view
                    className='confirm-dialog__btn confirm-dialog__btn--cancel'
                    bindtap={requestClose}
                    data-testid='plugin-update-close'
                  >
                    <text className='confirm-dialog__btn-text'>
                      {error != null || (check != null && !check.hasUpdate)
                        ? t('common.close')
                        : t('common.cancel')}
                    </text>
                  </view>
                  <view
                    className='confirm-dialog__btn confirm-dialog__btn--cancel'
                    bindtap={() => void runCheck()}
                    data-testid='plugin-update-recheck'
                  >
                    <text className='confirm-dialog__btn-text'>{t('jsplugin.recheck')}</text>
                  </view>
                  {check != null && check.hasUpdate
                    ? (
                      <view
                        className='confirm-dialog__btn confirm-dialog__btn--submit confirm-dialog__btn--full'
                        bindtap={() => void runUpdate()}
                        data-testid='plugin-update-now'
                      >
                        <text className='confirm-dialog__btn-text confirm-dialog__btn-text--submit'>
                          {t('jsplugin.updateNow')}
                        </text>
                      </view>
                    )
                    : null}
                </view>
              )
              : null}
          </view>
        </DialogContent>
      </DialogView>
    </DialogRoot>
  )
}
