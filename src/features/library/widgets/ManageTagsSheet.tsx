import { useEffect, useState } from '@lynx-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import type { SongTag } from '../../../models/song-tag.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { getSongTagsApi } from '../api/index.js'
import { songTagQueryKeys } from '../data/song-tags-query.js'
import { BackdropBlur } from '../../../shared/ui/BackdropBlur.js'
import { usePresence } from '../../../shared/ui/usePresence.js'
import '../../../shared/ui/overlay-motion.css'
import './ManageTagsSheet.css'

export interface ManageTagsSheetProps {
  songIds: number[]
  onClose: () => void
}

export function ManageTagsSheet({ songIds, onClose }: ManageTagsSheetProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [allTags, setAllTags] = useState<SongTag[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [initialIds, setInitialIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [newTagName, setNewTagName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useBackHandler(songIds.length > 0, () => {
    onClose()
    return true
  })

  const songIdsKey = songIds.join(',')

  useEffect(() => {
    if (songIds.length === 0) return
    const api = getSongTagsApi()
    setLoading(true)
    setNewTagName('')
    const load = async () => {
      try {
        const [tagsRes, ...perSongTags] = await Promise.all([
          api.list({ limit: 200, sort: 'song_count', order: 'desc' }),
          ...songIds.map((id) => api.getSongTags(id)),
        ])
        setAllTags(tagsRes.tags)
        let ids: Set<number>
        if (perSongTags.length === 1) {
          ids = new Set(perSongTags[0]!.map((t) => t.id))
        } else {
          const counts = new Map<number, number>()
          for (const tags of perSongTags) {
            for (const t of tags) {
              counts.set(t.id, (counts.get(t.id) ?? 0) + 1)
            }
          }
          ids = new Set(
            [...counts.entries()]
              .filter(([, c]) => c === perSongTags.length)
              .map(([id]) => id),
          )
        }
        setSelectedIds(ids)
        setInitialIds(ids)
      } catch {
        toast.error(t('addToPlaylist.loadFailed'))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [songIdsKey])

  const { mounted, leaving } = usePresence(songIds.length > 0)
  if (!mounted) return null

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const createTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    try {
      const tag = await getSongTagsApi().create(name)
      setAllTags((prev) => [tag, ...prev])
      setSelectedIds((prev) => new Set([...prev, tag.id]))
      setNewTagName('')
      toast.show(t('songTag.created'))
    } catch {
      toast.error(t('addToPlaylist.createFailed'))
    }
  }

  const save = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const api = getSongTagsApi()
      if (songIds.length === 1) {
        await api.setSongTags(songIds[0]!, [...selectedIds])
      } else {
        const added = [...selectedIds].filter((id) => !initialIds.has(id))
        const removed = [...initialIds].filter((id) => !selectedIds.has(id))
        for (const tagId of added) {
          await api.bind(tagId, songIds)
        }
        for (const tagId of removed) {
          await api.unbind(tagId, songIds)
        }
      }
      void queryClient.invalidateQueries({ queryKey: songTagQueryKeys.all })
      toast.show(t('songTag.saved'))
      onClose()
    } catch {
      toast.error(t('addToPlaylist.addFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <view className='manage-tags' data-testid='manage-tags-sheet'>
      {/* Real backdrop blur, behind the dim so the page is blurred and then
          darkened. A preceding sibling, not a child: the scrim below owns
          tap-to-dismiss and a child would sit in front of it. */}
      <BackdropBlur />
      <view className={`manage-tags__backdrop${leaving ? ' overlay--leave-fade' : ''}`} bindtap={onClose} />
      <view className={`manage-tags__panel ${leaving ? 'overlay--leave-up' : 'overlay--enter-up'}`}>
        <view className='atp__handle-wrap'>
          <view className='atp__handle' />
        </view>

        <view className='manage-tags__header'>
          <text className='manage-tags__title'>{t('songTag.manageTags')}</text>
          <view className='manage-tags__save-btn' bindtap={() => { void save() }}>
            <text className='manage-tags__save-text'>{t('songTag.save')}</text>
          </view>
        </view>

        <view className='manage-tags__create-row'>
          <Input
            className='manage-tags__create-input'
            placeholder={t('songTag.createHint')}
            value={newTagName}
            onInput={(v: string) => setNewTagName(v)}
          />
          <view
            className='manage-tags__create-btn'
            bindtap={() => { void createTag() }}
          >
            <text className='manage-tags__create-btn-text'>{t('songTag.create')}</text>
          </view>
        </view>

        {loading
          ? <text className='manage-tags__state'>{t('common.loading')}</text>
          : allTags.length === 0
            ? <text className='manage-tags__state'>{t('songTag.noTags')}</text>
            : (
              <scroll-view className='manage-tags__list' scroll-y>
                {allTags.map((tag) => (
                  <view
                    key={String(tag.id)}
                    className='manage-tags__row'
                    bindtap={() => toggle(tag.id)}
                  >
                    <view className={selectedIds.has(tag.id)
                      ? 'manage-tags__check manage-tags__check--active'
                      : 'manage-tags__check'}
                    >
                      {selectedIds.has(tag.id)
                        ? <Icon name='check' size={14} color={ICON_COLORS.primaryContent} />
                        : null}
                    </view>
                    {tag.color
                      ? <view className='manage-tags__dot' style={{ backgroundColor: tag.color }} />
                      : <Icon name='label' size={16} color={ICON_COLORS.contentMuted} />}
                    <text className='manage-tags__name'>{tag.name}</text>
                    <text className='manage-tags__count'>
                      {t(tag.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther', {
                        count: tag.songCount,
                      })}
                    </text>
                  </view>
                ))}
              </scroll-view>
            )}
      </view>
    </view>
  )
}
