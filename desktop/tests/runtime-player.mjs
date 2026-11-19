// Run inside Lynxtron, with SONGLOFT_TEST_MEDIA pointing to a synthetic fixture.
import { app } from '@lynx-js/lynxtron'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
app.whenReady().then(async () => {
  let native
  try {
    native = require(
      resolve(
        import.meta.dirname,
        '..',
        '.build',
        `darwin-${process.arch}`,
        'songloft_mpv.node',
      ),
    )
    const media = process.env.SONGLOFT_TEST_MEDIA
    assert.ok(media, 'SONGLOFT_TEST_MEDIA required')
    const untilReady = async (generation) => {
      const deadline = Date.now() + 15000
      while (Date.now() < deadline) {
        const status = native.player('status')
        assert.equal(status.error, '')
        if (status.ready && status.generation === generation) return status
        await delay(25)
      }
      throw new Error('Real player did not become ready')
    }
    native.player('load', media, 1, { pause: 'yes', start: '3', vid: 'no' })
    const first = await untilReady(1)
    assert.ok(Math.abs(first.positionMs - 3000) < 250, JSON.stringify(first))
    await delay(250)
    assert.ok(
      Math.abs(native.player('status').positionMs - first.positionMs) < 100,
    )
    native.player('set', 'pause', 'no')
    await delay(500)
    assert.ok(native.player('status').positionMs > first.positionMs + 200)
    native.player('load', '/definitely-missing-songloft-fixture', 2, {
      pause: 'yes',
      vid: 'no',
    })
    native.player('load', media, 3, { pause: 'yes', start: '7', vid: 'no' })
    const replacement = await untilReady(3)
    assert.ok(
      Math.abs(replacement.positionMs - 7000) < 250,
      JSON.stringify(replacement),
    )
    console.log(
      JSON.stringify({
        result: 'pass',
        arch: process.arch,
        first,
        replacement,
      }),
    )
    native.player('shutdown')
    app.exit(0)
  } catch (error) {
    console.error(error)
    try {
      native?.player('shutdown')
    } catch {}
    app.exit(1)
  }
})
