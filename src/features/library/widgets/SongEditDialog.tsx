import { useEffect, useState } from '@lynx-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import {
  DialogRoot,
  DialogView,
  DialogBackdrop,
  DialogContent,
} from '@lynx-js/lynx-ui-dialog'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { copyToClipboard } from '../../../native/native-platform.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import {
  SONG_DIALOG_WIDTH_PX,
  dialogBodyMaxHeight,
  dialogCardMaxHeight,
  dialogCardWidth,
} from '../../../shared/ui/dialog-viewport.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import type { Song } from '../../../models/song.js'
import { getSongsApi } from '../api/index.js'
import { BackdropBlur } from '../../../shared/ui/BackdropBlur.js'
import './SongEditDialog.css'

/** URL-with-scheme check — the Flutter form's `Uri.tryParse(value).hasScheme`. */
function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

export interface SongEditDialogProps {
  show: boolean
  song: Song | null
  onClose: () => void
}

/**
 * The song edit form as a centered large card — the replacement for the edit
 * page, ported from the Flutter build's `SongEditPage` (which was itself a
 * full-screen dialog there).
 *
 * Unlike the page, there is no getSong fetch: the store's song object seeds
 * the form the moment the dialog opens. That object is exactly what the user
 * is looking at (the row they tapped, or the player's current song), and the
 * save overwrites the server state anyway — the staleness window is the
 * user's own edit session.
 *
 * The form stays type-driven, like the page and the Flutter original:
 *  - **local** — title/artist/album go to `PUT /songs/{id}/tags` (DB + file
 *    tags, with the rename-in-sync switch); everything network-ish is hidden.
 *  - **remote / radio** — fields go to `PUT /songs/{id}`; the lyric URL change
 *    additionally goes through the lyrics endpoint. Plugin-sourced remote songs
 *    (`source_url` empty) have no editable direct link: the URL field is
 *    hidden and `url` is not sent back, or the internal play endpoint would be
 *    written into the DB as the source address.
 *
 * The modal chrome is `ConfirmDialog`'s (shared `.confirm-dialog__*` classes;
 * fixed-layer z-index 200/201 rule applies unchanged) with a taller, wider
 * card whose body scrolls between the pinned title and action rows.
 */
export function SongEditDialog({ show, song, onClose }: SongEditDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

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

  /*
   * Back closes the dialog. `show` starts false at the mount point, per the
   * back-stack's activation-order rule; the form state itself is re-seeded on
   * every open below.
   */
  useBackHandler(show, () => {
    onClose()
    return true
  })

  /*
   * Seed from the store's song on open (the page's getSong fetch is gone —
   * see the component doc). Re-runs when the song object changes, so opening
   * another row right after closing this one cannot show the previous values.
   */
  useEffect(() => {
    if (!show || !song) return
    setTitle(song.title)
    setArtist(song.artist ?? '')
    setAlbum(song.album ?? '')
    // Only source_url is editable — song.url is the internal play endpoint
    // (/api/v1/songs/{id}/play), not a source address.
    setUrl(song.sourceUrl ?? '')
    setCoverUrl(song.sourceCoverUrl ?? '')
    setDuration(Number.isFinite(song.duration) ? String(Math.round(song.duration)) : '')
    setLyricUrl(song.lyricRemoteUrl ?? '')
    setRenameFile(true)
    setIsVideo(song.isVideo)
    setTitleError('')
    setUrlError('')
  }, [show, song])

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
          accessibility-element={true}
          accessibility-label={t('common.copy')}
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
      // The endpoint's `file_write_status` result is irrelevant here (the song
      // edit form never writes lyric *content*), so the payload is discarded.
      return next
        ? api.updateLyrics(target.id, { lyricSource: 'url', lyricRemoteUrl: next }).then(() => {})
        : api.updateLyrics(target.id, { lyricSource: '', lyric: '' }).then(() => {})
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
        onClose()
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
    <DialogRoot show={show} onShowChange={(open) => { if (!open) onClose() }}>
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
          dialogContentProps={{ bindtap: onClose }}
        >
          {song == null ? null : (
            <view
              className='song-edit-dialog'
              data-testid='song-edit-dialog'
              /*
               * Inline clamps (device): the stylesheet's calc/vh is the Web
               * half, but on the native engines the viewport-relative units
               * proved unreliable under the fixed dialog layer — the long
               * remote form overflowed the screen top and cropped the pinned
               * title, and content-driven width made the card vary per song.
               * The measured px values cannot be reinterpreted; see
               * `dialog-viewport.ts`.
               */
              style={{
                maxHeight: dialogCardMaxHeight(),
                width: dialogCardWidth(SONG_DIALOG_WIDTH_PX),
              }}
              catchtap={() => {}}
            >
              <text className='song-edit-dialog__title'>{pageTitle}</text>

              {/*
               * The DIRECT body clamp is the one that keeps the title on
               * screen: the card-level max-height proved insufficient on
               * device because the body's flex-shrink does not propagate on
               * the native engines (the scroll-view kept its content height
               * and re-stretched the card). See `dialog-viewport.ts`.
               */}
              <scroll-view
                className='song-edit-dialog__body'
                scroll-y
                style={{ maxHeight: dialogBodyMaxHeight() }}
              >
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
                        <image className='song-edit__preview-img' mode='aspectFill' src={cover} />
                      </view>
                    )
                    : null}
                </view>
              </scroll-view>

              <view className='confirm-dialog__actions'>
                {/* No DialogClose — it wraps the child in a lynx-ui Button whose
                 * defaults made the buttons unequal in height; see ConfirmDialog. */}
                <view
                  className='confirm-dialog__btn confirm-dialog__btn--cancel'
                  bindtap={onClose}
                  data-testid='song-edit-cancel'
                >
                  <text className='confirm-dialog__btn-text'>{t('common.cancel')}</text>
                </view>
                <view
                  className='confirm-dialog__btn confirm-dialog__btn--submit'
                  bindtap={onSave}
                  data-testid='song-edit-save'
                >
                  <text className='confirm-dialog__btn-text confirm-dialog__btn-text--submit'>
                    {saving ? t('songEdit.saving') : t('songEdit.save')}
                  </text>
                </view>
              </view>
            </view>
          )}
        </DialogContent>
      </DialogView>
    </DialogRoot>
  )
}
