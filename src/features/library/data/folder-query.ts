import { useQuery } from '@tanstack/react-query'

import type { FolderListResponse } from '../../../models/folder.js'
import { getSongsApi } from '../api/index.js'

export const folderQueryKeys = {
  list: (path: string, keyword: string) =>
    ['library', 'folders', path, keyword] as const,
}

export function useFoldersQuery(path: string, keyword = '') {
  return useQuery<FolderListResponse>({
    queryKey: folderQueryKeys.list(path, keyword),
    queryFn: () => getSongsApi().getFolders(path, keyword || undefined),
  })
}
