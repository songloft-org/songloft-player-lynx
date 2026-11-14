import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getPlaylistApi } from '../../playlist/api/index.js'
import { playPlaylistTarget } from '../data/playlist-resume.js'
import { parseSong } from '../../../models/song.js'
import { toast } from '../../../shared/ui/toast-store.js'

export function PlaylistResumeCard({ id, audiobook, onLocate }: { id: number; audiobook: boolean; onLocate?: (songId: number) => void }) {
 const { t } = useTranslation()
 const query = useQuery({ queryKey: ['playlist-progress', id], queryFn: () => getPlaylistApi().getProgress(id), refetchInterval: 5000, retry: false })
 const progress = query.data
 if (!progress) return null
 if (progress.invalid) return <text>{t('playlistProgressInvalid')}</text>
 if (!progress.song) return null
 const song = parseSong(progress.song)
 const seconds = Math.floor(progress.position_ms / 1000)
 return <view className='playlist-detail__resume' style={{ padding: '12px' }}>
   <view bindtap={() => { void playPlaylistTarget({ id, resume: !progress.completed }).catch(e => toast.error(String(e))) }} accessibility-element={true} accessibility-label={t('playlistContinue')}>
     <text>{progress.completed ? t('playlistFinished') : t(audiobook ? 'playlistContinueBook' : 'playlistContinue')}</text>
     <text>{song.title} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</text>
   </view>
   <view bindtap={() => onLocate?.(song.id)}><text>{t('playlistLocateResume')}</text></view>
 </view>
}
