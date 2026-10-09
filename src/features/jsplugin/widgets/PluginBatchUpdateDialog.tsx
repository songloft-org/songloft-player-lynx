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
import { getJSPluginApi } from '../api/index.js'
import { useUpdateAllPluginsMutation } from '../data/jsplugin-mutations.js'
import type { GithubProxyParams } from '../api/index.js'
import type { JSPluginBatchUpdateResponse } from '../../../models/jsplugin.js'
// Chrome (card/scrim/buttons + the z-index overlay contract) is ConfirmDialog's;
// only the stats block and the per-plugin rows are specific to this flow.
import { ModalMaterial } from '../../../shared/ui/ModalMaterial.js'
import { ModalScrim } from '../../../shared/ui/ModalScrim.js'
import {
  DIALOG_WIDTH_PX,
  dialogCardWidth,
  dialogCardMaxHeight,
  dialogContentMaxHeight,
} from '../../../shared/ui/dialog-viewport.js'
import '../../../shared/ui/ConfirmDialog.css'
import './PluginBatchUpdateDialog.css'

export interface PluginBatchUpdateDialogProps {
  show: boolean
  onClose: () => void
  /** The configured GitHub proxy, forwarded to the batch endpoint when set. */
  githubProxy?: string
}

/**
 * The batch update flow, mirroring Flutter's `_JSPluginBatchUpdateDialog`:
 * confirm → run (no close affordances; a batch re-downloads several plugins and
 * interrupting the dialog does not interrupt the server) → stats (updated /
 * failed / skipped) plus one line per plugin with `v1 → v2`, the error, or
 * "already latest".
 */
export function PluginBatchUpdateDialog({ show, onClose, githubProxy }: PluginBatchUpdateDialogProps) {
  const { t } = useTranslation()
  const updateAllMutation = useUpdateAllPluginsMutation()

  type Phase = 'confirm' | 'updating' | 'result'
  const [phase, setPhase] = useState<Phase>('confirm')
  const [result, setResult] = useState<JSPluginBatchUpdateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runningRef = useRef(false)

  // Every open starts over — the previous run's numbers must not linger.
  useEffect(() => {
    if (show) {
      setPhase('confirm')
      setResult(null)
      setError(null)
    }
  }, [show])

  const params: GithubProxyParams & { force?: boolean } = githubProxy ? { githubProxy } : {}

  const run = async () => {
    if (runningRef.current) return
    runningRef.current = true
    setPhase('updating')
    setError(null)
    try {
      // The API owns the batch deadline; a second timer can report failure
      // while the request is still within its allowed update time.
      const res = await updateAllMutation.mutateAsync(params)
      setResult(res)
    } catch (e) {
      setError(e instanceof HttpTimeoutError
        ? t('jsplugin.batchUpdateTimeout')
        : e instanceof Error ? e.message : String(e))
    } finally {
      runningRef.current = false
      setPhase('result')
    }
  }

  // Back closes — never mid-run, for the same reason there is no close button.
  useBackHandler(show, () => {
    if (phase === 'updating') return true
    onClose()
    return true
  })

  const requestClose = () => {
    if (phase === 'updating') return
    onClose()
  }

  const row = (r: JSPluginBatchUpdateResponse['results'][number]) => {
    const name = r.pluginName || r.entryPath
    if (r.success) {
      return { name, note: `v${r.currentVersion} → v${r.newVersion}`, tone: 'ok' as const }
    }
    if (r.hasUpdate) {
      return { name, note: r.error ?? t('jsplugin.updateFailedShort'), tone: 'bad' as const }
    }
    if (r.error != null) {
      return { name, note: r.error, tone: 'warn' as const }
    }
    return { name, note: t('jsplugin.versionLatest', { version: r.currentVersion }), tone: 'muted' as const }
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
          {/* Light page dim; the content panel owns its local material. */}

          <ModalScrim active={show} priority={200} className='confirm-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent
          className='confirm-dialog__content'
          transition
          dialogContentProps={{ bindtap: requestClose }}
        >
          <view
            className='confirm-dialog batch-update'
            data-testid='plugin-batch-dialog'
            catchtap={() => {}}
            style={{ width: dialogCardWidth(DIALOG_WIDTH_PX), maxHeight: dialogCardMaxHeight() }}
          >
            <ModalMaterial shape='dialog' />
            <text className='confirm-dialog__title' text-maxline='2'>{t('jsplugin.updateAll')}</text>
            <scroll-view
              className='confirm-dialog__body'
              scroll-y
              style={{ maxHeight: dialogContentMaxHeight() }}
            >
              {phase === 'confirm'
                ? <text className='batch-update__text'>{t('jsplugin.batchConfirm')}</text>
                : null}

              {phase === 'updating'
                ? (
                  <view className='batch-update__updating'>
                    <text className='batch-update__text'>{t('jsplugin.batchUpdating')}</text>
                    <text className='batch-update__hint'>{t('jsplugin.doNotClose')}</text>
                  </view>
                )
                : null}

              {phase === 'result' && error != null
                ? (
                  <view className='batch-update__error' data-testid='plugin-batch-error'>
                    <text className='batch-update__error-text'>{error}</text>
                  </view>
                )
                : null}

              {phase === 'result' && error == null && result != null
                ? (
                  <view>
                    <view className='batch-update__stats' data-testid='plugin-batch-stats'>
                      <view className='batch-update__stat'>
                        <text className='batch-update__stat-num batch-update__stat-num--ok'>
                          {result.updated}
                        </text>
                        <text className='batch-update__stat-label'>{t('jsplugin.statUpdated')}</text>
                      </view>
                      <view className='batch-update__stat'>
                        <text className='batch-update__stat-num batch-update__stat-num--bad'>
                          {result.failed}
                        </text>
                        <text className='batch-update__stat-label'>{t('jsplugin.statFailed')}</text>
                      </view>
                      <view className='batch-update__stat'>
                        <text className='batch-update__stat-num batch-update__stat-num--muted'>
                          {result.skipped}
                        </text>
                        <text className='batch-update__stat-label'>{t('jsplugin.statSkipped')}</text>
                      </view>
                    </view>
                    <view className='batch-update__rows' data-testid='plugin-batch-rows'>
                      {result.results.map((r) => {
                        const info = row(r)
                        return (
                          <view key={`${r.pluginId}-${r.entryPath}`} className='batch-update__row'>
                            <text className={`batch-update__row-name batch-update__row-name--${info.tone}`}>
                              {info.name}
                            </text>
                            <text className='batch-update__row-note'>{info.note}</text>
                          </view>
                        )
                      })}
                    </view>
                  </view>
                )
                : null}
            </scroll-view>
            {phase !== 'updating'
              ? (
                <view className='confirm-dialog__actions'>
                  <view
                    className='confirm-dialog__btn confirm-dialog__btn--cancel'
                    bindtap={requestClose}
                    data-testid='plugin-batch-close'
                  >
                    <text className='confirm-dialog__btn-text'>
                      {phase === 'result' && error == null ? t('common.close') : t('common.cancel')}
                    </text>
                  </view>
                  {phase !== 'result' || error != null
                    ? (
                      <view
                        className='confirm-dialog__btn confirm-dialog__btn--submit'
                        bindtap={() => void run()}
                        data-testid='plugin-batch-start'
                      >
                        <text className='confirm-dialog__btn-text confirm-dialog__btn-text--submit'>
                          {t('jsplugin.startUpdate')}
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
