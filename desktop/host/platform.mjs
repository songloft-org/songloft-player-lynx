import { readFile, writeFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

export function createPlatformServices({
  dialog,
  shell,
  clipboard,
  getWindow,
  network,
}) {
  const tasks = new Set()
  return {
    async openURL(raw) {
      const url = new URL(raw)
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol))
        throw new Error('External protocol denied')
      await shell.openExternal(url.href)
      return null
    },
    clipboard(text) {
      if (typeof text !== 'string' || text.length > 4 * 1024 * 1024)
        throw new Error('Invalid clipboard value')
      clipboard.writeText(text)
      return null
    },
    async pickDirectory() {
      const result = await dialog.showOpenDialog(getWindow(), {
        properties: ['openDirectory'],
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    setInsecureTls(enabled) {
      // Network transport and mpv receive this per-session setting; never mutate
      // NODE_TLS_REJECT_UNAUTHORIZED or other process-wide trust configuration.
      return network.configure({ insecureTls: enabled })
    },
    async pickAndUploadFile({ uploadUrl, fieldName }) {
      const url = new URL(uploadUrl)
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(fieldName)
      )
        throw new Error('Invalid upload')
      const selected = await dialog.showOpenDialog(getWindow(), {
        properties: ['openFile'],
      })
      if (selected.canceled || !selected.filePaths[0])
        throw new Error('Upload cancelled')
      const path = selected.filePaths[0]
      if ((await stat(path)).size > 128 * 1024 * 1024)
        throw new Error('Upload too large')
      const controller = new AbortController()
      tasks.add(controller)
      const timer = setTimeout(() => controller.abort(), 120000)
      try {
        const body = new FormData()
        body.set(
          fieldName,
          new Blob([await readFile(path, { signal: controller.signal })]),
          basename(path),
        )
        const response = await network.fetch(url, {
          method: 'POST',
          body,
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Upload rejected')
        return await response.text()
      } finally {
        clearTimeout(timer)
        tasks.delete(controller)
      }
    },
    async saveFile({ base64, name }) {
      if (
        typeof base64 !== 'string' ||
        base64.length > 48 * 1024 * 1024 ||
        typeof name !== 'string'
      )
        throw new Error('Invalid export')
      const selected = await dialog.showSaveDialog(getWindow(), {
        defaultPath: basename(name),
      })
      if (selected.canceled || !selected.filePath) return null
      await writeFile(selected.filePath, Buffer.from(base64, 'base64'), {
        mode: 0o600,
      })
      return null
    },
    stop() {
      for (const task of tasks) task.abort()
      tasks.clear()
    },
  }
}
