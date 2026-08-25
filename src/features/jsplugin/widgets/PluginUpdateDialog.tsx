import { useEffect, useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import {
  DialogRoot,
  DialogView,
  DialogBackdrop,
  DialogContent,
} from '@lynx-js/lynx-ui-dialog'

import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { getJSPluginApi } from '../api/index.js'
import { useGithubProxyQuery } from '../data/jsplugin-query.js'
import { useUpdatePluginMutation } from '../data/jsplugin-mutations.js'
import type { JSPlugin, JSPluginUpdateCheck } from '../../../models/jsplugin.js'
// The dialog chrome (card, scrim, buttons) is ConfirmDialog's — including the
// z-index levels its overlay contract test pins. Only the body and the dynamic
// action row are specific to the update flow.
import '../../../shared/ui/ConfirmDialog.css'
import './PluginUpdateDialog.css'

/** Rejects with `label` after `ms`, mirroring the Flutter dialog's timeouts. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      // The marker keeps the caller from wrapping the timeout text in a
      // "check failed: …" prefix — the timeout wording is complete on its own.
      const err = new Error(label) as Error & { timedOut?: boolean }
      err.timedOut = true
      reject(err)
    }, ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** A timeout rejects with its own complete wording; anything else gets the prefix. */
function isTimedOut(e: unknown): boolean {
  return typeof e === 'object' && e != null && (e as { timedOut?: boolean }).timedOut === true
}

export interface PluginUpdateDialogProps {
  show: boolean
  /** The plugin being checked; kept nullable so the owner can close by clearing it. */
  plugin: JSPlugin | null
  onClose: () => void
}

/**
 * The single-plugin update flow, mirroring Flutter's `_JSPluginUpdateDialog`:
 * open → auto check (20s timeout) → result ("already latest" or `v1 → v2`) →
 * update now (120s timeout, no close affordances while it runs).
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
  const cancelledRef = useRef(false)

  const proxyParams = githubProxy ? { githubProxy } : {}

  const runCheck = async () => {
    if (!plugin) return
    setPhase('checking')
    setError(null)
    setCheck(null)
    try {
      const res = await withTimeout(
        Promise.resolve(getJSPluginApi().checkUpdate(plugin.id, proxyParams)),
        20_000,
        t('jsplugin.checkUpdateTimeout'),
      )
      if (cancelledRef.current) return
      setCheck(res)
    } catch (e) {
      if (cancelledRef.current) return
      setError(isTimedOut(e)
        ? errorMessage(e)
        : t('jsplugin.checkUpdateFailed', { error: errorMessage(e) }))
    } finally {
      if (!cancelledRef.current) setPhase('result')
    }
  }

  const runUpdate = async () => {
    if (!plugin) return
    setPhase('updating')
    setError(null)
    try {
      await withTimeout(
        updatePluginMutation.mutateAsync({ id: plugin.id, ...proxyParams }),
        120_000,
        t('jsplugin.updateTimeout'),
      )
      if (cancelledRef.current) return
      toast.success(t('jsplugin.updateSuccess'))
      onClose()
    } catch (e) {
      if (cancelledRef.current) return
      setError(isTimedOut(e)
        ? errorMessage(e)
        : t('jsplugin.updateFailed', { error: errorMessage(e) }))
      setPhase('result')
    }
  }

  // Every open starts a fresh check. The cancelled flag covers the close-during-
  // flight case — without it a late answer would flip a closed dialog's state.
  useEffect(() => {
    if (!show || !plugin) return
    cancelledRef.current = false
    void runCheck()
    return () => {
      cancelledRef.current = true
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
          <view className='confirm-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent
          className='confirm-dialog__content'
          transition
          dialogContentProps={{ bindtap: requestClose }}
        >
          <view className='confirm-dialog plugin-update' data-testid='plugin-update-dialog' catchtap={() => {}}>
            <text className='confirm-dialog__title'>
              {t('jsplugin.updateDialogTitle', { name: plugin?.displayName ?? '' })}
            </text>

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
                        className='confirm-dialog__btn confirm-dialog__btn--confirm'
                        bindtap={() => void runUpdate()}
                        data-testid='plugin-update-now'
                      >
                        <text className='confirm-dialog__btn-text confirm-dialog__btn-text--confirm'>
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
