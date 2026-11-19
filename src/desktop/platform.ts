import { desktopCall, desktopConfig } from './client.js'
import { desktopCookies } from './cef.js'
import type { PlaybackKeyState } from '../native/web-playback-keys.js'

export function desktopPlatformModule() {
  if (!desktopConfig()) return null
  return {
    setPlaybackShortcuts(state: PlaybackKeyState) {
      void desktopCall('keyboard.configure', { ...state }).catch(() => {})
    },
    getCookies(
      origin: string,
      callback: (error: string | null, cookies: string | null) => void,
    ) {
      void desktopCookies(origin).then(
        (value) => callback(null, JSON.stringify(value)),
        () => callback('cookies_unavailable', null),
      )
    },
    logWrite(line: string) {
      void desktopCall('log.write', { line }).catch(() => {})
    },
    logRead(callback: (error: string | null, content: string | null) => void) {
      void desktopCall<string | null>('log.read').then(
        (value) => callback(null, value),
        () => callback('log_read_failed', null),
      )
    },
    openURL(url: string) {
      void desktopCall('platform.openURL', { url }).catch(() => {})
    },
    openExternalURL(url: string, callback: (error: string | null) => void) {
      void desktopCall('platform.openURL', { url }).then(
        () => callback(null),
        () => callback('could not open external URL'),
      )
    },
    setInsecureTls(enabled: boolean) {
      void desktopCall('platform.setInsecureTls', { enabled }).catch(() => {})
    },
    setClipboardWithResult(
      text: string,
      callback: (error: string | null) => void,
    ) {
      void desktopCall('platform.clipboard', { text }).then(
        () => callback(null),
        () => callback('clipboard_failed'),
      )
    },
    shareFile(
      base64: string,
      fileName: string,
      _mimeType: string,
      callback: (error: string | null) => void,
    ) {
      void desktopCall('platform.saveFile', { base64, name: fileName }).then(
        () => callback(null),
        () => callback('export_failed'),
      )
    },
    pickAndUploadFile(
      uploadUrl: string,
      fieldName: string,
      mimeType: string,
      callback: (error: string | null, body: string | null) => void,
    ) {
      void desktopCall<string>('platform.pickAndUploadFile', {
        uploadUrl,
        fieldName,
        mimeType,
      }).then(
        (body) => callback(null, body),
        () => callback('upload_failed', null),
      )
    },
  }
}
