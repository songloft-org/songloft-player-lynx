type LibrarySearch = { view?: 'songs' | 'facets' | 'playlists' | 'radio'; field?: 'artist' | 'album' | 'genre' }

let last: LibrarySearch = {}

export function getLastLibrarySearch(): LibrarySearch {
  return last
}

export function setLastLibrarySearch(search: LibrarySearch): void {
  last = search
}
