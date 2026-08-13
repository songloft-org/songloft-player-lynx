/**
 * iOS E2E environment setup — ensures a simulator is booted and the app is
 * installed before running e2e tests.
 *
 * Usage: `node scripts/e2e-ios-setup.mjs`
 * Called automatically by `pnpm run e2e:ios`.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const APP_PATH = resolve(repoRoot, 'ios/build/Debug-iphonesimulator/SongloftLynx.app')
const BUNDLE_ID = 'org.songloft.lynx'

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf8', timeout: 30_000 }).trim()
}

function getBootedSimulator() {
  try {
    const raw = exec('xcrun simctl list devices --json')
    const parsed = JSON.parse(raw)
    for (const [, devices] of Object.entries(parsed.devices)) {
      for (const d of devices) {
        if (d.state === 'Booted' && d.isAvailable) return d
      }
    }
  } catch { /* no simulators */ }
  return null
}

function findBestSimulator() {
  try {
    const raw = exec('xcrun simctl list devices --json')
    const parsed = JSON.parse(raw)
    const all = []
    for (const [runtime, devices] of Object.entries(parsed.devices)) {
      for (const d of devices) {
        if (d.isAvailable) all.push({ ...d, runtime })
      }
    }
    const priorities = ['iPhone 16', 'iPhone 15', 'iPhone']
    for (const prefix of priorities) {
      const match = all.find(d => d.name.startsWith(prefix))
      if (match) return match
    }
    return all[0] ?? null
  } catch {
    return null
  }
}

function isAppInstalled(udid) {
  try {
    exec(`xcrun simctl get_app_container ${udid} ${BUNDLE_ID}`)
    return true
  } catch {
    return false
  }
}

// ── Main ──

console.log('╔══════════════════════════════════════════╗')
console.log('║   iOS E2E Environment Setup             ║')
console.log('╚══════════════════════════════════════════╝')
console.log()

// 1. Check simulator
let device = getBootedSimulator()
if (device) {
  console.log(`✓ Simulator booted: ${device.name} (${device.udid})`)
} else {
  const candidate = findBestSimulator()
  if (!candidate) {
    console.error('✗ No available iOS simulator. Install one via Xcode → Settings → Platforms.')
    process.exit(1)
  }
  console.log(`  Booting simulator: ${candidate.name}...`)
  exec(`xcrun simctl boot ${candidate.udid}`)
  // Wait for boot
  let booted = false
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000))
    device = getBootedSimulator()
    if (device) { booted = true; break }
  }
  if (!booted) {
    console.error('✗ Simulator did not boot within 30s')
    process.exit(1)
  }
  console.log(`✓ Simulator booted: ${device.name} (${device.udid})`)
}

// 2. Check app build
if (!existsSync(APP_PATH)) {
  console.error(`✗ App not built. Run: pnpm run ios:build`)
  console.error(`  Expected: ${APP_PATH}`)
  process.exit(1)
}
console.log(`✓ App build found: ${APP_PATH}`)

// 3. Install app if needed
if (!isAppInstalled(device.udid)) {
  console.log(`  Installing app...`)
  exec(`xcrun simctl install ${device.udid} "${APP_PATH}"`)
  console.log(`✓ App installed`)
} else {
  console.log(`✓ App already installed`)
}

// 4. Set consistent status bar
try {
  exec(`xcrun simctl status_bar ${device.udid} override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4`)
  console.log(`✓ Status bar set to fixed state (9:41, full battery)`)
} catch {
  console.log(`  (status bar override not supported on this runtime)`)
}

console.log()
console.log('Ready to run: E2E_PLATFORM=ios pnpm run test:e2e')
console.log()
