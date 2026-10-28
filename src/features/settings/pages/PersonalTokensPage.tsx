import { useEffect, useRef, useState } from '@lynx-js/react'
import { Input } from '@lynx-js/lynx-ui-input'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../../../native/native-platform.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { getPersonalTokenApi, personalTokenSession, type PersonalToken } from '../api/personal-token-api.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import './PersonalTokensPage.css'

type Dialog = { kind: 'create'; token?: string } | { kind: 'revoke'; target: PersonalToken }

export function PersonalTokensPage() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [session] = useState(personalTokenSession)
  const [api] = useState(() => getPersonalTokenApi(session))
  const [offset, setOffset] = useState(0)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const copying = useRef(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const query = useQuery({ queryKey: [...session.key, offset], queryFn: () => api.list(offset), retry: false })

  const close = () => { if (!pending.current) { setDialog(null); setName(''); setError(null); setCopied(false) } }
  const confirm = async () => {
    if (!dialog || pending.current) return
    if (dialog.kind === 'create' && dialog.token) { close(); return }
    if (dialog.kind === 'create' && !name.trim()) { setError(t('personalTokens.nameRequired')); return }
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      session.assertCurrent()
      if (dialog.kind === 'create') {
        const token = await api.create(name)
        if (alive.current) setDialog({ kind: 'create', token })
      } else {
        await api.revoke(dialog.target.id)
        if (alive.current) setDialog(null)
      }
      void client.invalidateQueries({ queryKey: session.key })
    } catch { if (alive.current) setError(t('personalTokens.failed')) }
    finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  const copy = async (header: boolean) => {
    if (dialog?.kind !== 'create' || !dialog.token || copying.current) return
    copying.current = true
    setCopied(false)
    setError(null)
    try {
      session.assertCurrent()
      await copyToClipboard(header ? `Authorization: Bearer ${dialog.token}` : dialog.token)
      if (alive.current) setCopied(true)
    } catch { if (alive.current) setError(t('personalTokens.copyFailed')) }
    finally { copying.current = false }
  }
  const secret = dialog?.kind === 'create' ? dialog.token : undefined
  const format = (value: string) => new Date(value).toLocaleString()
  return (
    <SubPageShell grouped title={t('personalTokens.title')} backTestId='personal-tokens-back' overlay={
      <ConfirmDialog show={dialog !== null} title={t(dialog?.kind === 'revoke' ? 'personalTokens.revoke' : 'personalTokens.create')}
        message={t(dialog?.kind === 'revoke' ? 'personalTokens.revokeHelp' : secret ? 'personalTokens.once' : 'personalTokens.help')}
        confirmLabel={t(busy ? 'common.loading' : secret ? 'personalTokens.done' : dialog?.kind === 'revoke' ? 'personalTokens.revoke' : 'personalTokens.create')}
        acknowledgeOnly={!!secret} onConfirm={() => { void confirm() }} onCancel={close}
        testId='personal-token-dialog' confirmTestId='personal-token-confirm' cancelTestId='personal-token-cancel'>
        {dialog?.kind === 'create' && !secret && <Input id='personal-token-name' className='personal-tokens__input'
          value={name} placeholder={t('personalTokens.name')} maxLength={80} readonly={busy} onInput={setName} />}
        {secret && <view>
          <Input id='personal-token-secret' className='personal-tokens__input' value={secret} readonly />
          <SettingsRow title={t('personalTokens.copy')} onTap={() => { void copy(false) }} testId='personal-token-copy' />
          <SettingsRow title={t('personalTokens.copyHeader')} onTap={() => { void copy(true) }} testId='personal-token-copy-header' />
          {copied && <text className='personal-tokens__status'>{t('personalTokens.copied')}</text>}
        </view>}
        {dialog?.kind === 'revoke' && <text className='personal-tokens__status'>{dialog.target.name}</text>}
        {error && <text className='personal-tokens__error'>{error}</text>}
      </ConfirmDialog>
    }>
      <SettingsSection>
        <SettingsRow icon='link' title={t('personalTokens.create')} subtitle={t('personalTokens.help')}
          onTap={() => { setError(null); setCopied(false); setDialog({ kind: 'create' }) }} testId='personal-token-create' />
      </SettingsSection>
      {query.isLoading && <text className='personal-tokens__status'>{t('common.loading')}</text>}
      {query.isError && <SettingsRow title={t('personalTokens.failed')} subtitle={t('common.retry')}
        onTap={() => { void query.refetch() }} testId='personal-token-retry' />}
      {query.data && <SettingsSection>
        {query.data.tokens.length === 0 && <SettingsRow title={t('personalTokens.empty')} disabled />}
        {query.data.tokens.map(token => <view key={token.id}>
          <SettingsRow title={token.name} subtitle={`${token.prefix}… · ${t(token.revokedAt ? 'personalTokens.revoked' : 'personalTokens.permanent')}\n${t('personalTokens.created')}: ${format(token.createdAt)}\n${t('personalTokens.lastUsed')}: ${token.lastUsedAt ? format(token.lastUsedAt) : t('personalTokens.neverUsed')}`} />
          {!token.revokedAt && <SettingsRow title={t('personalTokens.revoke')} danger testId={`personal-token-revoke-${token.id}`}
            onTap={() => { setError(null); setDialog({ kind: 'revoke', target: token }) }} />}
        </view>)}
        <SettingsRow title={`${offset + (query.data.tokens.length ? 1 : 0)}–${offset + query.data.tokens.length} / ${query.data.total}`} disabled />
        {offset > 0 && <SettingsRow title={t('personalTokens.previous')} onTap={() => setOffset(offset - 20)} testId='personal-token-previous' />}
        {offset + query.data.tokens.length < query.data.total && <SettingsRow title={t('personalTokens.next')} onTap={() => setOffset(offset + 20)} testId='personal-token-next' />}
      </SettingsSection>}
    </SubPageShell>
  )
}
