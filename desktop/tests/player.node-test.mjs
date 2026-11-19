import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DesktopPlayer } from '../host/player.mjs'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('audio facade reports volume in contract units and rejects stale source readiness', async (t) => {
  const calls = [],
    events = []
  let status = {
    generation: 0,
    ready: false,
    volume: 0.75,
    error: '',
    positionMs: 0,
    paused: true,
  }
  const player = new DesktopPlayer({
    native: {
      player(...args) {
        calls.push(args)
        return args[0] === 'status' ? status : null
      },
    },
    network: { options: { insecureTls: false, proxy: null } },
  })
  t.after(() => player.close())
  player.on('event', (event) => events.push(event))
  await player.command({ method: 'volumeQuery' })
  assert.equal(
    events.find((event) => event.type === 'volumeChanged').volume,
    75,
  )
  await player.command({
    method: 'load',
    value: 'https://media.invalid/old',
    options: { sourceId: 'old', autoplay: true },
  })
  await player.command({
    method: 'load',
    value: 'https://media.invalid/new',
    options: { sourceId: 'new', initialPositionMs: 7000, autoplay: true },
  })
  await player.command({ method: 'pause' })
  status = { ...status, generation: 1, ready: true, positionMs: 3000 }
  await wait(150)
  assert.equal(events.filter((event) => event.type === 'sourceReady').length, 0)
  status = { ...status, generation: 2, positionMs: 7000 }
  await wait(150)
  assert.deepEqual(
    events
      .filter((event) => event.type === 'sourceReady')
      .map((event) => [event.sourceId, event.positionMs]),
    [['new', 7000]],
  )
  assert.ok(
    calls.some(
      (call) => call[0] === 'set' && call[1] === 'pause' && call[2] === 'yes',
    ),
    'pending pause must survive readiness',
  )
})
