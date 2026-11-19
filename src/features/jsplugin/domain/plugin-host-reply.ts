import type { HostCallResult } from './plugin-host-dispatch.js'

export interface PluginHostReply extends HostCallResult {
  afterReply?: () => void | Promise<void>
}

export const HOST_REPLY_RECEIVED = 'hostReplyReceived'

/** A plugin can confirm only the current reply from its own mounted bridge. */
export function createPluginReplyGate() {
  let pending: { id: string; expires: number; action: NonNullable<PluginHostReply['afterReply']> } | undefined
  return {
    stage(id: string, { afterReply, ...result }: PluginHostReply): HostCallResult {
      if (!result.ok || !afterReply) return result
      pending = { id, expires: Date.now() + 10000, action: afterReply }
      return { ...result, acknowledge: true }
    },
    confirm(id: string) {
      if (pending?.id !== id) return
      const { action, expires } = pending
      pending = undefined
      if (Date.now() <= expires)
        void Promise.resolve().then(action).catch((error) => console.warn('Could not open plugin video', error))
    },
    clear() { pending = undefined },
  }
}
