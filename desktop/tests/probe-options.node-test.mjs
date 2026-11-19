import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readProbeOptions } from '../probe-options.mjs'

test('the business entry has no scheduled exit or automatic media', () => {
  const options = readProbeOptions(['runtime', '/app/desktop'])
  assert.equal(options.enabled, false)
  assert.equal(options.durationMs, null)
  assert.equal(options.media, '')
})

test('native evidence run preserves paths and explicitly enables its scenario', () => {
  const media = '/tmp/中文 space/fixture.mp4'
  const options = readProbeOptions([
    '--probe',
    `--probe-media=${media}`,
    '--probe-cef',
    '--probe-report',
    '--probe-timeline',
    '--probe-duration-ms=12000',
  ])
  assert.equal(options.media, media)
  assert.equal(options.durationMs, 12000)
  assert.ok(options.cef && options.report && options.timeline)
})

test('diagnostic switches cannot quit the business UI or run an invalid timeline', () => {
  assert.throws(
    () => readProbeOptions(['--probe-duration-ms=10000']),
    /require --probe/,
  )
  assert.throws(
    () => readProbeOptions(['--probe', '--probe-timeline']),
    /requires --probe-media/,
  )
  for (const value of ['NaN', 'Infinity', '-1', '0', '1.5', '600001', '']) {
    assert.throws(
      () => readProbeOptions(['--probe', `--probe-duration-ms=${value}`]),
      /integer from/,
    )
  }
})
