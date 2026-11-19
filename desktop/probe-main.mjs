import { app, LynxWindow, dialog } from '@lynx-js/lynxtron'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { assertTarget } from './target.mjs'
import { readProbeOptions } from './probe-options.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
let window
let exitTimer
const diagnosticRun =
  process.argv.includes('--probe') && process.argv.includes('--probe-report')

app.whenReady().then(async () => {
  try {
    const probeOptions = readProbeOptions(process.argv)
    const probe = probeOptions.enabled
    const target = assertTarget()
    app.setName('Songloft Lynx Desktop Probe')
    const userData = join(
      app.getPath('appData'),
      'org.songloft.lynx.desktop.probe',
    )
    mkdirSync(userData, { recursive: true })
    app.setPath('userData', userData)
    if (process.platform === 'win32')
      app.setAppUserModelId('org.songloft.lynx.desktop.probe')
    const require = createRequire(import.meta.url)
    // Both registrations must run before creating any LynxWindow.
    require(join(root, '.build', target, 'songloft_mpv.node'))
    require('@lynx-js/cef-webview/lynxtron').initialize()
    const bundle = join(
      root,
      '..',
      'dist',
      ...(probe ? ['desktop-probe'] : []),
      'main.lynx.bundle',
    )
    if (!existsSync(bundle))
      throw new Error(
        `Missing ${bundle}. Run pnpm run desktop:build from the client root.`,
      )
    window = new LynxWindow({
      width: 1280,
      height: 820,
      title: probe
        ? 'Songloft · Desktop native probe'
        : 'Songloft · Desktop UI preview',
    })
    window.on('--lynx-error', (_event, error) =>
      console.error('[desktop] Lynx error', error),
    )
    window.on('closed', () => {
      clearTimeout(exitTimer)
      window = null
    })
    if (
      !window.loadFile(bundle, {
        globalProps: {
          songloftDesktopProbe: true,
          songloftDesktopProbeOptions: probeOptions,
          deployMode: 'standalone',
          systemTheme: 'light',
          systemLanguage:
            typeof app.getLocale === 'function'
              ? app.getLocale()
              : Intl.DateTimeFormat().resolvedOptions().locale,
        },
      })
    )
      throw new Error('Lynx rejected the bundle load request')
    window.show()
    if (probeOptions.durationMs !== null) {
      exitTimer = setTimeout(() => app.quit(), probeOptions.durationMs)
    }
  } catch (error) {
    console.error('[desktop] Startup failed:', error)
    if (!diagnosticRun)
      await dialog.showMessageBox({
        type: 'error',
        title: 'Songloft desktop probe',
        message: String(error),
      })
    app.exit(1)
  }
})
app.on('window-all-closed', () => app.quit())
