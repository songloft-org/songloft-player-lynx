type LibrarySearch = { view?: 'songs' | 'facets' | 'playlists' | 'radio'; field?: string }

let last: LibrarySearch = {}

export function getLastLibrarySearch(): LibrarySearch {
  return last
}

export function setLastLibrarySearch(search: LibrarySearch): void {
  last = search
}
