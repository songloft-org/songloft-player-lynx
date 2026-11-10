import { useQuery } from '@tanstack/react-query'
import { getSongTagsApi } from '../../library/api/index.js'
import './PlaylistTagLine.css'

export function PlaylistTagLine({ labels = [] }: { labels?: string[] }) {
  if (!labels.some(label => /^tag:[1-9]\d*$/.test(label))) return null
  return <ResolvedTags labels={labels} />
}

function ResolvedTags({ labels }: { labels: string[] }) {
  // All cards share one cached catalog request, rather than fetching per playlist.
  const catalog = useQuery({
    queryKey: ['song-tags', 'definitions'],
    queryFn: () => getSongTagsApi().all(),
    staleTime: 0,
  })
  const selected = new Set(labels)
  const names = catalog.data?.filter(tag => selected.has(`tag:${tag.id}`)).map(tag => tag.name) ?? []
  if (names.length === 0) return null
  return <text className='playlist-tag-line'>{names.join(' · ')}</text>
}
