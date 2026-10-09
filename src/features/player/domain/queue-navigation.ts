import { resolveNext, resolvePrev, type PlayMode } from './play-mode.js'

/** Session-only history and manual priority, shared by local audio and DLNA. */
export class QueueNavigation {
  private history: number[] = []
  private cursor = -1
  private pendingCursor: number | null = null
  private priority: number[] = []
  private played = new Set<number>()
  private selected: number | null = null
  private mode: PlayMode = 'order'

  get hasPriority(): boolean { return this.priority.length > 0 }
  get lastPlayedIndex(): number { return this.history[this.cursor] ?? -1 }
  private get effectiveCursor(): number { return this.pendingCursor ?? this.cursor }

  prioritize(index: number): void {
    this.priority = [index, ...this.priority.filter(value => value !== index)]
    this.selected = null
  }

  reset(mode: PlayMode, keepPriority = false): void {
    this.mode = mode
    this.history = []
    this.cursor = -1
    this.pendingCursor = null
    this.played.clear()
    this.selected = null
    if (!keepPriority) this.priority = []
  }

  remap(indices: Map<number, number>): void {
    const history: number[] = []
    let cursor = -1
    let pending: number | null = null
    this.history.forEach((index, position) => {
      const mapped = indices.get(index)
      if (mapped == null) return
      history.push(mapped)
      if (position <= this.cursor) cursor = history.length - 1
      if (position === this.pendingCursor) pending = history.length - 1
    })
    this.history = history
    this.cursor = cursor
    this.pendingCursor = pending
    const mapped = (values: Iterable<number>) => Array.from(values)
      .flatMap(index => indices.has(index) ? [indices.get(index)!] : [])
    this.priority = mapped(this.priority)
    this.played = new Set(mapped(this.played))
    this.selected = null
  }

  markPlayed(index: number): void {
    if (index < 0) return
    this.played.add(index)
    this.priority = this.priority.filter(value => value !== index)
    const pending = this.pendingCursor
    this.pendingCursor = null
    if (pending != null && this.history[pending] === index) {
      this.cursor = pending
    } else if (this.history[this.cursor] !== index) {
      this.history.splice(this.cursor + 1)
      this.history.push(index)
      this.cursor = this.history.length - 1
    }
    this.selected = null
  }

  markFailed(index: number): void {
    this.played.add(index)
    this.priority = this.priority.filter(value => value !== index)
    if (this.pendingCursor != null && this.pendingCursor > this.cursor) {
      this.history.splice(this.pendingCursor, 1)
    }
    this.pendingCursor = null
    this.selected = null
  }

  previous(current: number, length: number): number | null {
    if (length === 0) return null
    this.selected = null
    if (this.mode !== 'random') {
      this.pendingCursor = null
      return resolvePrev(this.mode, current, length)
    }
    const cursor = this.previousCursor(current)
    if (cursor < 0) return null
    this.pendingCursor = cursor
    return this.history[cursor] ?? null
  }

  hasPrevious(current: number): boolean { return this.previousCursor(current) >= 0 }

  private previousCursor(current: number): number {
    const cursor = this.effectiveCursor
    // New selection has not loaded yet; go back to the last actual playback.
    const unplayed = this.pendingCursor == null && cursor >= 0 && this.history[cursor] !== current
    return unplayed ? cursor : cursor - 1
  }

  next(current: number, length: number): number | null {
    if (length === 0) return null
    if (this.hasPriority) {
      this.pendingCursor = null
      this.selected = null
      return this.priority.shift()!
    }
    if (this.mode === 'random' && this.effectiveCursor + 1 < this.history.length) {
      this.pendingCursor = this.effectiveCursor + 1
      this.selected = null
      return this.history[this.pendingCursor]
    }
    this.pendingCursor = null
    const index = this.peekNext(current, length)
    this.selected = null
    return index
  }

  /** Does not consume priority/history. Random selection is reused by playback. */
  peekNext(current: number, length: number): number | null {
    if (length === 0 || current < 0) return null
    if (this.hasPriority) return this.priority[0]
    if (this.mode === 'random' && this.effectiveCursor + 1 < this.history.length) {
      return this.history[this.effectiveCursor + 1]
    }
    if (this.mode !== 'random') return resolveNext(this.mode, current, length)
    if (this.selected != null) return this.selected
    if (length === 1) return this.selected = 0
    let candidates = Array.from({ length }, (_, index) => index)
      .filter(index => index !== current && !this.played.has(index))
    if (candidates.length === 0) {
      this.played.clear()
      this.played.add(current)
      candidates = Array.from({ length }, (_, index) => index).filter(index => index !== current)
    }
    return this.selected = candidates[Math.floor(Math.random() * candidates.length)]
  }
}
