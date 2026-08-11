type LibrarySearch = { view?: 'songs' | 'facets' | 'playlists'; field?: 'artist' | 'album' | 'genre' }

let last: LibrarySearch = {}

export function getLastLibrarySearch(): LibrarySearch {
  return last
}

export function setLastLibrarySearch(search: LibrarySearch): void {
  last = search
}
