import type { SelectorQuery } from '@lynx-js/types'

// exec() only submits queued work. Only invoke callbacks finish the request.
export function createProbeDrawer(
  createQuery: () => SelectorQuery | undefined,
  reportError: (error: string) => void,
  selector = '#mpv-probe',
) {
  let alive = true
  let pending = false
  return {
    draw() {
      if (!alive || pending) return
      const query = createQuery()
      if (!query) return
      pending = true
      try {
        query
          .select(selector)
          .invoke({
            method: 'draw',
            params: {},
            success: (failure: string) => {
              pending = false
              if (alive && failure) reportError(failure)
            },
            fail: (failure) => {
              pending = false
              if (alive) reportError(`Native draw failed (${failure.code})`)
            },
          })
          .exec()
      } catch (error) {
        pending = false
        if (alive) reportError(String(error))
      }
    },
    dispose() {
      alive = false
    },
  }
}
