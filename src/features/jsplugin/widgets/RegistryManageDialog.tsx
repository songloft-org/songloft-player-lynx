import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import {
  DialogRoot,
  DialogView,
  DialogBackdrop,
  DialogContent,
} from '@lynx-js/lynx-ui-dialog'

import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { toast } from '../../../shared/ui/toast-store.js'
import type { PluginRegistryConfig } from '../api/index.js'
import { getJSPluginApi } from '../api/index.js'
// Chrome (card/scrim/buttons + the z-index overlay contract) is ConfirmDialog's;
// only the source rows and the edit form are specific to this dialog.
import '../../../shared/ui/ConfirmDialog.css'
import './RegistryManageDialog.css'

export interface RegistryManageDialogProps {
  show: boolean
  onClose: () => void
  /** The current source list, handed in so the store keeps owning the fetch. */
  registries: PluginRegistryConfig[]
  onSaved: (registries: PluginRegistryConfig[]) => void
}

/** The URL that gets the「官方」badge, matching the Flutter store. */
const OFFICIAL_REGISTRY_URL =
  'https://raw.githubusercontent.com/songloft-org/songloft-plugin-registry/main/registry.json'

/**
 * Source management, mirroring the Flutter `_RegistryManagementDialog` — with
 * one deliberate difference: the nested add/edit dialog became an in-dialog
 * phase switch, because two stacked lynx-ui dialogs share the same fixed
 * z-layer and the edit sheet cannot reliably cover its parent on both hosts.
 *
 * Edits (including deletions) are local until 保存 PUTs the whole list, same
 * as Flutter; the store refetches from the saved list afterwards.
 */
export function RegistryManageDialog({ show, onClose, registries, onSaved }: RegistryManageDialogProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<PluginRegistryConfig[]>([])
  /* 'list' shows the rows; 'form' is add (index null) or edit (index set).
     A single `editingIndex` cannot carry both — null would mean "add" AND
     "list", and the add form never opened. */
  const [phase, setPhase] = useState<'list' | 'form'>('list')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [formUrl, setFormUrl] = useState('')
  const [formName, setFormName] = useState('')
  const [formToken, setFormToken] = useState('')
  const [saving, setSaving] = useState(false)

  // A fresh draft on every open — discarding edits on close is Flutter's
  // behaviour too.
  useEffect(() => {
    if (show) {
      setDraft(registries)
      setPhase('list')
    }
  }, [show, registries])

  const openForm = (index: number | null) => {
    const r = index == null ? undefined : draft[index]
    setFormUrl(r?.url ?? '')
    setFormName(r?.name ?? '')
    setFormToken(r?.token ?? '')
    setEditingIndex(index)
    setPhase('form')
  }

  const commitForm = () => {
    const url = formUrl.trim()
    if (!url) return
    const entry: PluginRegistryConfig = {
      url,
      name: formName.trim(),
      token: formToken.trim(),
      enabled: editingIndex == null ? true : draft[editingIndex]!.enabled !== false,
    }
    setDraft((list) =>
      editingIndex == null
        ? [...list, entry]
        : list.map((r, i) => (i === editingIndex ? entry : r)),
    )
    setPhase('list')
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await getJSPluginApi().updatePluginRegistries(draft)
      onSaved(draft)
      onClose()
    } catch (e: unknown) {
      toast.error(t('jsplugin.saveFailed', {
        error: e instanceof Error ? e.message : String(e),
      }))
    } finally {
      setSaving(false)
    }
  }

  // Back closes the dialog; from the edit form it goes back to the list first.
  useBackHandler(show, () => {
    if (phase === 'form') {
      setPhase('list')
      return true
    }
    onClose()
    return true
  })

  return (
    <DialogRoot show={show} onShowChange={(open: boolean) => { if (!open) onClose() }}>
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
          dialogContentProps={{ bindtap: onClose }}
        >
          <view className='confirm-dialog registry-manage' data-testid='registry-manage-dialog' catchtap={() => {}}>
            <text className='confirm-dialog__title'>{t('jsplugin.manageRegistries')}</text>

            {phase === 'list'
              ? (
                <view>
                  {draft.length === 0
                    ? (
                      <text className='registry-manage__empty' data-testid='registry-manage-empty'>
                        {t('jsplugin.noRegistries')}
                      </text>
                    )
                    : (
                      <view className='registry-manage__list'>
                        {draft.map((r, i) => (
                          <view key={r.url} className='registry-manage__row' data-testid={`registry-manage-row-${i}`}>
                            <AppSwitch
                              checked={r.enabled !== false}
                              onChange={(enabled) =>
                                setDraft((list) => list.map((x, j) => (j === i ? { ...x, enabled } : x)))}
                            />
                            <view className='registry-manage__row-body'>
                              <view className='registry-manage__row-title'>
                                <text className='registry-manage__row-name'>
                                  {r.name || r.url}
                                </text>
                                {r.url === OFFICIAL_REGISTRY_URL
                                  ? <text className='registry-manage__official'>{t('jsplugin.official')}</text>
                                  : null}
                                {r.token
                                  ? <Icon name='fingerprint' size={12} color={ICON_COLORS.contentMuted} />
                                  : null}
                              </view>
                              <text className='registry-manage__row-url'>{r.url}</text>
                            </view>
                            <view
                              className='registry-manage__row-btn'
                              bindtap={() => openForm(i)}
                              data-testid={`registry-manage-edit-${i}`}
                            >
                              <Icon name='edit' size={16} color={ICON_COLORS.content2} />
                            </view>
                            <view
                              className='registry-manage__row-btn'
                              bindtap={() => setDraft((list) => list.filter((_, j) => j !== i))}
                              data-testid={`registry-manage-delete-${i}`}
                            >
                              <Icon name='trash' size={16} color={ICON_COLORS.danger} />
                            </view>
                          </view>
                        ))}
                      </view>
                    )}
                  <view
                    className='registry-manage__add-btn'
                    bindtap={() => openForm(null)}
                    data-testid='registry-manage-add'
                  >
                    <Icon name='plus' size={16} color={ICON_COLORS.content} />
                    <text className='registry-manage__add-text'>{t('jsplugin.addRegistry')}</text>
                  </view>
                  <view className='confirm-dialog__actions'>
                    <view
                      className='confirm-dialog__btn confirm-dialog__btn--cancel'
                      bindtap={onClose}
                      data-testid='registry-manage-cancel'
                    >
                      <text className='confirm-dialog__btn-text'>{t('common.cancel')}</text>
                    </view>
                    <view
                      className='confirm-dialog__btn confirm-dialog__btn--confirm'
                      bindtap={() => void save()}
                      data-testid='registry-manage-save'
                    >
                      <text className='confirm-dialog__btn-text confirm-dialog__btn-text--confirm'>
                        {saving ? t('common.loading') : t('jsplugin.saveLabel')}
                      </text>
                    </view>
                  </view>
                </view>
              )
              : (
                <view>
                  <view className='registry-manage__form'>
                    <Input
                      className='registry-manage__input'
                      value={formUrl}
                      placeholder='https://example.com/registry.json'
                      onInput={(v: string) => setFormUrl(v)}
                    />
                    <Input
                      className='registry-manage__input'
                      value={formName}
                      placeholder={t('jsplugin.nameOptional')}
                      onInput={(v: string) => setFormName(v)}
                    />
                    <Input
                      className='registry-manage__input'
                      value={formToken}
                      placeholder={t('jsplugin.tokenOptional')}
                      onInput={(v: string) => setFormToken(v)}
                    />
                  </view>
                  <view className='confirm-dialog__actions'>
                    <view
                      className='confirm-dialog__btn confirm-dialog__btn--cancel'
                      bindtap={() => setPhase('list')}
                      data-testid='registry-manage-form-cancel'
                    >
                      <text className='confirm-dialog__btn-text'>{t('common.cancel')}</text>
                    </view>
                    <view
                      className={`confirm-dialog__btn confirm-dialog__btn--confirm${formUrl.trim() ? '' : ' registry-manage__save--disabled'}`}
                      bindtap={commitForm}
                      data-testid='registry-manage-form-save'
                    >
                      <text className='confirm-dialog__btn-text confirm-dialog__btn-text--confirm'>
                        {editingIndex != null
                          ? t('jsplugin.saveLabel')
                          : t('jsplugin.addLabel')}
                      </text>
                    </view>
                  </view>
                </view>
              )}
          </view>
        </DialogContent>
      </DialogView>
    </DialogRoot>
  )
}
