import { readNativeModules } from './native-modules.js'
import { isWebPlatform } from './web-platform.js'

export interface FileTransferLabels {
  title: string
  choose: string
  save: string
  cancel: string
}

interface TextFilesModule {
  pickTextFile: (options: FileTransferLabels, callback: (error: string | null, text: string | null) => void) => void
  saveTextFile: (options: FileTransferLabels & { text: string; fileName: string }, callback: (error: string | null) => void) => void
  cancelTextFile: () => void
}

function module(): TextFilesModule {
  const host = readNativeModules()?.SongloftPlatform as Partial<TextFilesModule> | undefined
  if (!isWebPlatform() || typeof host?.pickTextFile !== 'function'
    || typeof host?.saveTextFile !== 'function' || typeof host?.cancelTextFile !== 'function') {
    throw new Error('file_transfer_unavailable')
  }
  return host as TextFilesModule
}

/** DOM/file objects stay on the main thread; the Worker receives only UTF-8 text. */
export function pickJsonText(labels: FileTransferLabels): Promise<string> {
  return new Promise((resolve, reject) => {
    module().pickTextFile(labels, (error, text) => {
      if (error) reject(new Error(error))
      else if (typeof text !== 'string') reject(new Error('invalid_json'))
      else resolve(text)
    })
  })
}

export function saveJsonText(options: FileTransferLabels & { text: string; fileName: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    module().saveTextFile(options, error => error ? reject(new Error(error)) : resolve())
  })
}

export function cancelWebFileTransfer(): void {
  const host = readNativeModules()?.SongloftPlatform as Partial<TextFilesModule> | undefined
  if (isWebPlatform() && typeof host?.cancelTextFile === 'function') host.cancelTextFile()
}
