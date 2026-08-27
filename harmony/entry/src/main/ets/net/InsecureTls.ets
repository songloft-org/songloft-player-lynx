/**
 * InsecureTls — single source of truth for the TLS validation toggle.
 *
 * Three outbound paths share this switch (mirroring Android/iOS):
 * 1. Lynx fetch (SongloftHttpService)
 * 2. Media streaming (AVPlayer url loading)
 * 3. Module-level requests (DLNA SOAP, cache downloads)
 *
 * Toggling off must immediately take effect — the HTTP service recreates its
 * http client instance (same as iOS invalidateAndCancel + rebuild pattern).
 */
export class InsecureTls {
  private static enabled: boolean = false
  private static listeners: Array<(enabled: boolean) => void> = []

  static isEnabled(): boolean {
    return InsecureTls.enabled
  }

  static setEnabled(value: boolean): void {
    if (InsecureTls.enabled === value) return
    InsecureTls.enabled = value
    for (const listener of InsecureTls.listeners) {
      listener(value)
    }
  }

  static addListener(listener: (enabled: boolean) => void): void {
    InsecureTls.listeners.push(listener)
  }

  static removeListener(listener: (enabled: boolean) => void): void {
    const idx = InsecureTls.listeners.indexOf(listener)
    if (idx >= 0) InsecureTls.listeners.splice(idx, 1)
  }
}
