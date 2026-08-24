import { useEffect, useState } from '@lynx-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { copyToClipboard } from '../../../native/native-platform.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import type { Song } from '../../../models/song.js'
import { getSongsApi } from '../api/index.js'
import './SongEditPage.css'

/** URL-with-scheme check — the Flutter form's `Uri.tryParse(value).hasScheme`. */
function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

/**
 * `/library/song/$songId/edit` — the song edit form, ported from the Flutter
 * build's `SongEditPage` (edit mode only; adding songs stays on `/library/add`).
 *
 * The form is type-driven, like the Flutter one:
 *  - **local** — title/artist/album go to `PUT /songs/{id}/tags` (DB + file
 *    tags, with the rename-in-sync switch); everything network-ish is hidden.
 *  - **remote / radio** — fields go to `PUT /songs/{id}`; the lyric URL change
 *    additionally goes through the lyrics endpoint. Plugin-sourced remote songs
 *    (`source_url` empty) have no editable direct link: the URL field is
 *    hidden and `url` is not sent back, or the internal play endpoint would be
 *    written into the DB as the source address.
 *
 * Back (arrow and hardware key alike) returns to the page this one was opened
 * from — the song detail page when its edit button was used, the library /
 * playlist / facet page when the song menu opened it straight away. That
 * origin is recorded by `useNavigateToSongEdit`, not derivable from the
 * history stack.
 */
export function SongEditPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const params = useParams({ strict: false }) as { songId?: string }
  const id = Number(params.songId ?? 0) || 0

  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [url, setUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [duration, setDuration] = useState('')
  const [lyricUrl, setLyricUrl] = useState('')
  // Local songs: rename the file to the new title while writing tags (default on,
  // as in Flutter). Network/radio: manually declare "this link carries video".
  const [renameFile, setRenameFile] = useState(true)
  const [isVideo, setIsVideo] = useState(false)
  const [titleError, setTitleError] = useState('')
  const [urlError, setUrlError] = useState('')

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    void getSongsApi().getSong(id)
      .then(s => {
        setSong(s)
        setTitle(s.title)
        setArtist(s.artist ?? '')
        setAlbum(s.album ?? '')
        // Only source_url is editable — song.url is the internal play endpoint
        // (/api/v1/songs/{id}/play), not a source address.
        setUrl(s.sourceUrl ?? '')
        setCoverUrl(s.sourceCoverUrl ?? '')
        setDuration(Number.isFinite(s.duration) ? String(Math.round(s.duration)) : '')
        setLyricUrl(s.lyricRemoteUrl ?? '')
        setIsVideo(s.isVideo)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const isLocal = song?.type === 'local'
  const isRadio = song?.type === 'radio'
  const isPluginRemote = song != null && song.type === 'remote' && !song.sourceUrl

  const pageTitle = !song
    ? t('songDetail.edit')
    : isLocal
      ? t('songEdit.titleLocal')
      : isRadio
        ? t('songEdit.titleRadio')
        : t('songEdit.titleRemote')

  /** One read-only row (path / endpoint). Empty values render nothing. */
  const readOnlyRow = (label: string, value: string | undefined) => {
    if (!value) return null
    return (
      <view className='song-edit__ro-row'>
        <text className='song-edit__ro-label'>{label}</text>
        <text className='song-edit__ro-value'>{value}</text>
        <view
          className='song-edit__ro-copy'
          data-testid='song-edit-copy'
          bindtap={() => {
            copyToClipboard(value)
            toast.success(t('songEdit.copied'))
          }}
        >
          <Icon name='copy' size={14} color={ICON_COLORS.contentMuted} />
        </view>
      </view>
    )
  }

  const submit = (target: Song, trimmedTitle: string, trimmedUrl: string): Promise<void> => {
    if (target.type === 'local') {
      return getSongsApi().writeTags(target.id, {
        title: trimmedTitle,
        artist: artist.trim(),
        album: album.trim(),
        renameFile,
      })
    }
    const api = getSongsApi()
    const parsedDuration = duration.trim() === '' ? undefined : Number(duration.trim())
    return api.updateSong(target.id, {
      title: trimmedTitle,
      artist: artist.trim(),
      album: isRadio ? undefined : album.trim(),
      url: isPluginRemote ? undefined : trimmedUrl,
      coverUrl: coverUrl.trim(),
      duration: isRadio || parsedDuration == null || !Number.isFinite(parsedDuration)
        ? undefined
        : parsedDuration,
      isVideo,
    }).then(() => {
      // Lyric URL is not a PUT /songs/{id} field: changes (including clearing)
      // go through the lyrics endpoint, remote songs only.
      if (isRadio) return
      const next = lyricUrl.trim()
      const prev = target.lyricRemoteUrl ?? ''
      if (next === prev) return
      return next
        ? api.updateLyrics(target.id, { lyricSource: 'url', lyricRemoteUrl: next })
        : api.updateLyrics(target.id, { lyricSource: '', lyric: '' })
    })
  }

  const onSave = () => {
    if (saving || !song) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setTitleError(t('songEdit.titleRequired'))
      return
    }
    const trimmedUrl = url.trim()
    if (!isLocal && !isPluginRemote) {
      if (!trimmedUrl) {
        setUrlError(t('songEdit.urlRequired'))
        return
      }
      if (!hasScheme(trimmedUrl)) {
        setUrlError(t('songEdit.urlInvalid'))
        return
      }
    }

    setSaving(true)
    void submit(song, trimmedTitle, trimmedUrl)
      .then(() => {
        // Lists and facets embed the edited fields (title/artist/album are facet
        // values), so a save must age every library/playlist cache, not just the
        // song row.
        void queryClient.invalidateQueries({ queryKey: ['library'] })
        void queryClient.invalidateQueries({ queryKey: ['playlist'] })
        toast.success(t('songEdit.saveSuccess'))
        performRouteBack()
      })
      .catch((e: unknown) => {
        toast.error(t('songEdit.operationFailed', {
          error: e instanceof Error ? e.message : String(e),
        }))
      })
      .finally(() => setSaving(false))
  }

  // The preview shows the song's *current* cover (edit mode in Flutter too) —
  // the entered source cover URL is only applied on save.
  const cover = song?.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''

  return (
    <view className='song-edit'>
      <view className='song-edit__topbar'>
        <view className='song-edit__back' bindtap={() => performRouteBack()}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='song-edit__topbar-title'>{pageTitle}</text>
        <view className='song-edit__save-btn' bindtap={onSave} data-testid='song-edit-save'>
          <text className='song-edit__save-btn-text'>
            {saving ? t('songEdit.saving') : t('songEdit.save')}
          </text>
        </view>
      </view>

      <scroll-view className='song-edit__content' scroll-y>
        {loading
          ? <text className='song-edit__state'>{t('common.loading')}</text>
          : !song
            ? <text className='song-edit__state'>{t('songDetail.notFound')}</text>
            : (
              <view className='song-edit__form'>
                <view className='song-edit__ro-card'>
                  <text className='song-edit__ro-card-title'>
                    {isLocal ? t('songEdit.fileInfoReadonly') : t('songEdit.serverEndpointReadonly')}
                  </text>
                  {isLocal
                    ? readOnlyRow(t('songEdit.readonlyFile'), song.filePath)
                    : (
                      <view>
                        {readOnlyRow(t('songEdit.readonlyPlay'), song.url)}
                        {readOnlyRow(t('songEdit.readonlyCover'), song.coverUrl)}
                        {readOnlyRow(t('songEdit.readonlyLyric'), song.lyricUrl)}
                      </view>
                    )}
                </view>

                <text className='song-edit__label'>{t('songEdit.titleLabel')}</text>
                <Input
                  className='song-edit__input'
                  value={title}
                  onInput={(v: string) => { setTitle(v); setTitleError('') }}
                  placeholder={t('songEdit.titlePlaceholder')}
                />
                {titleError ? <text className='song-edit__error'>{titleError}</text> : null}

                <text className='song-edit__label'>{t('songEdit.artistLabel')}</text>
                <Input
                  className='song-edit__input'
                  value={artist}
                  onInput={(v: string) => setArtist(v)}
                  placeholder={t('songEdit.artistHint')}
                />

                {!isRadio
                  ? (
                    <view>
                      <text className='song-edit__label'>{t('songEdit.albumLabel')}</text>
                      <Input
                        className='song-edit__input'
                        value={album}
                        onInput={(v: string) => setAlbum(v)}
                        placeholder={t('songEdit.albumHint')}
                      />
                    </view>
                  )
                  : null}

                {isLocal
                  ? (
                    <view className='song-edit__switch-row' data-testid='song-edit-rename-row'>
                      <view className='song-edit__switch-body'>
                        <text className='song-edit__switch-title'>{t('songEdit.renameFileTitle')}</text>
                        <text className='song-edit__switch-subtitle'>{t('songEdit.renameFileSubtitle')}</text>
                      </view>
                      <AppSwitch checked={renameFile} onChange={setRenameFile} />
                    </view>
                  )
                  : null}

                {!isLocal && !isPluginRemote
                  ? (
                    <view>
                      <text className='song-edit__label'>{t('songEdit.urlLabel')}</text>
                      <Input
                        className='song-edit__input'
                        value={url}
                        onInput={(v: string) => { setUrl(v); setUrlError('') }}
                        placeholder={t('songEdit.urlHint')}
                      />
                      {urlError ? <text className='song-edit__error'>{urlError}</text> : null}
                    </view>
                  )
                  : null}

                {!isLocal
                  ? (
                    <view>
                      <text className='song-edit__label'>{t('songEdit.coverUrlLabel')}</text>
                      <Input
                        className='song-edit__input'
                        value={coverUrl}
                        onInput={(v: string) => setCoverUrl(v)}
                        placeholder={t('songEdit.coverUrlHint')}
                      />
                    </view>
                  )
                  : null}

                {!isLocal && !isRadio
                  ? (
                    <view>
                      <text className='song-edit__label'>{t('songEdit.durationLabel')}</text>
                      <Input
                        className='song-edit__input'
                        type='digit'
                        value={duration}
                        onInput={(v: string) => setDuration(v)}
                        placeholder={t('songEdit.durationHint')}
                      />
                    </view>
                  )
                  : null}

                {!isLocal && !isRadio
                  ? (
                    <view>
                      <text className='song-edit__label'>{t('songEdit.lyricUrlLabel')}</text>
                      <Input
                        className='song-edit__input'
                        value={lyricUrl}
                        onInput={(v: string) => setLyricUrl(v)}
                        placeholder={t('songEdit.lyricUrlHint')}
                      />
                    </view>
                  )
                  : null}

                {!isLocal
                  ? (
                    <view className='song-edit__switch-row' data-testid='song-edit-video-row'>
                      <view className='song-edit__switch-body'>
                        <text className='song-edit__switch-title'>{t('songEdit.videoToggleTitle')}</text>
                        <text className='song-edit__switch-subtitle'>{t('songEdit.videoToggleSubtitle')}</text>
                      </view>
                      <AppSwitch checked={isVideo} onChange={setIsVideo} />
                    </view>
                  )
                  : null}

                {cover
                  ? (
                    <view className='song-edit__preview'>
                      <text className='song-edit__label'>{t('songEdit.coverPreview')}</text>
                      <image className='song-edit__preview-img' src={cover} />
                    </view>
                  )
                  : null}
              </view>
            )}
      </scroll-view>
    </view>
  )
}
