import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { sleep } from './utils.js'

export interface SimulatorDevice {
  udid: string
  name: string
  state: 'Booted' | 'Shutdown' | string
  runtime: string
  isAvailable: boolean
}

interface SimctlDeviceList {
  devices: Record<string, Array<{
    udid: string
    name: string
    state: string
    isAvailable: boolean
  }>>
}

function exec(cmd: string, timeout = 30_000): string {
  return execSync(cmd, { encoding: 'utf8', timeout }).trim()
}

/**
 * Parse `xcrun simctl list devices --json` into a flat array of available devices.
 */
function listAllDevices(): SimulatorDevice[] {
  const raw = exec('xcrun simctl list devices --json')
  const parsed: SimctlDeviceList = JSON.parse(raw)
  const result: SimulatorDevice[] = []

  for (const [runtime, devices] of Object.entries(parsed.devices)) {
    for (const d of devices) {
      if (d.isAvailable) {
        result.push({
          udid: d.udid,
          name: d.name,
          state: d.state,
          runtime,
          isAvailable: true,
        })
      }
    }
  }
  return result
}

/**
 * Find an available simulator matching the given name pattern.
 * Prefers iPhone 16 > iPhone 15 > any iPhone > any available device.
 */
export function findSimulator(preferredName?: string): SimulatorDevice | null {
  const devices = listAllDevices()
  if (devices.length === 0) return null

  if (preferredName) {
    const match = devices.find((d) =>
      d.name.toLowerCase().includes(preferredName.toLowerCase()),
    )
    if (match) return match
  }

  // Priority: iPhone 16 → iPhone 15 → any iPhone → any
  const priorities = ['iPhone 16', 'iPhone 15', 'iPhone']
  for (const prefix of priorities) {
    const match = devices.find((d) => d.name.startsWith(prefix))
    if (match) return match
  }

  return devices[0] ?? null
}

/**
 * Get the currently booted simulator, or null if none is booted.
 */
export function getBootedSimulator(): SimulatorDevice | null {
  const devices = listAllDevices()
  return devices.find((d) => d.state === 'Booted') ?? null
}

/**
 * Boot a simulator by UDID. No-op if already booted.
 */
export function bootSimulator(udid: string): void {
  const devices = listAllDevices()
  const target = devices.find((d) => d.udid === udid)
  if (!target) throw new Error(`Simulator ${udid} not found`)
  if (target.state === 'Booted') return

  exec(`xcrun simctl boot ${udid}`)
}

/**
 * Wait until the simulator is fully booted and responsive.
 */
export async function waitForBoot(udid: string, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const devices = listAllDevices()
    const device = devices.find((d) => d.udid === udid)
    if (device?.state === 'Booted') {
      // Extra wait for SpringBoard to be ready
      await sleep(2000)
      return
    }
    await sleep(1000)
  }
  throw new Error(`Simulator ${udid} did not boot within ${timeout}ms`)
}

/**
 * Shutdown a simulator by UDID.
 */
export function shutdownSimulator(udid: string): void {
  try {
    exec(`xcrun simctl shutdown ${udid}`)
  } catch {
    // already shutdown
  }
}

/**
 * Install a .app bundle into the simulator.
 */
export function installApp(udid: string, appPath: string): void {
  if (!existsSync(appPath)) {
    throw new Error(
      `App not found at ${appPath}. Run \`pnpm run ios:build\` first.`,
    )
  }
  exec(`xcrun simctl install ${udid} "${appPath}"`)
}

/**
 * Check if an app is installed on the simulator.
 */
export function isAppInstalled(udid: string, bundleId: string): boolean {
  try {
    const result = exec(`xcrun simctl get_app_container ${udid} ${bundleId}`)
    return result.length > 0
  } catch {
    return false
  }
}

/**
 * Uninstall an app from the simulator (clears all data).
 */
export function uninstallApp(udid: string, bundleId: string): void {
  try {
    exec(`xcrun simctl uninstall ${udid} ${bundleId}`)
  } catch {
    // not installed — fine
  }
}

/**
 * Launch an app in the simulator.
 */
export function launchApp(udid: string, bundleId: string): void {
  exec(`xcrun simctl launch ${udid} ${bundleId}`)
}

/**
 * Terminate a running app in the simulator.
 */
export function terminateApp(udid: string, bundleId: string): void {
  try {
    exec(`xcrun simctl terminate ${udid} ${bundleId}`)
  } catch {
    // not running — fine
  }
}

/**
 * Set the simulator appearance (light/dark).
 */
export function setAppearance(udid: string, appearance: 'light' | 'dark'): void {
  exec(`xcrun simctl ui ${udid} appearance ${appearance}`)
}

/**
 * Override the status bar for consistent screenshots.
 */
export function overrideStatusBar(udid: string): void {
  exec(
    `xcrun simctl status_bar ${udid} override ` +
    `--time "9:41" ` +
    `--batteryState charged ` +
    `--batteryLevel 100 ` +
    `--wifiBars 3 ` +
    `--cellularBars 4`,
  )
}

/**
 * Clear status bar overrides.
 */
export function clearStatusBarOverride(udid: string): void {
  try {
    exec(`xcrun simctl status_bar ${udid} clear`)
  } catch {
    // older runtimes may not support this
  }
}

/**
 * Open a URL in the simulator (for deep-link testing).
 */
export function openURL(udid: string, url: string): void {
  exec(`xcrun simctl openurl ${udid} "${url}"`)
}

/**
 * Take a screenshot of the simulator.
 */
export function takeScreenshot(udid: string, outputPath: string): void {
  exec(`xcrun simctl io ${udid} screenshot "${outputPath}"`)
}

/**
 * Simulate pushing a notification to the app.
 */
export function sendPushNotification(
  udid: string,
  bundleId: string,
  payload: Record<string, unknown>,
): void {
  const payloadStr = JSON.stringify(payload)
  exec(`echo '${payloadStr}' | xcrun simctl push ${udid} ${bundleId} -`)
}

/**
 * Grant or revoke a privacy permission for the app.
 */
export function setPrivacyPermission(
  udid: string,
  bundleId: string,
  service: 'microphone' | 'photos' | 'camera' | 'location' | 'notifications',
  grant: boolean,
): void {
  const action = grant ? 'grant' : 'revoke'
  exec(`xcrun simctl privacy ${udid} ${action} ${service} ${bundleId}`)
}

/**
 * Get a display-friendly summary of the simulator environment.
 */
export function getEnvironmentInfo(): string {
  const booted = getBootedSimulator()
  const lines = [
    '=== iOS Simulator E2E Environment ===',
    '',
  ]

  if (booted) {
    lines.push(`Booted:  ${booted.name} (${booted.udid})`)
    lines.push(`Runtime: ${booted.runtime.replace('com.apple.CoreSimulator.SimRuntime.', '')}`)
  } else {
    lines.push('No simulator is currently booted.')
    const candidate = findSimulator()
    if (candidate) {
      lines.push(`Suggestion: boot "${candidate.name}" (${candidate.udid})`)
    } else {
      lines.push('No available simulators found. Install one via Xcode.')
    }
  }

  return lines.join('\n')
}
