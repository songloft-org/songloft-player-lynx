import type { LibraryViewKey } from '../domain/library-views.js'

type LibrarySearch = { view?: LibraryViewKey }

let last: LibrarySearch = {}

export function getLastLibrarySearch(): LibrarySearch {
  return last
}

export function setLastLibrarySearch(search: LibrarySearch): void {
  last = search
}
