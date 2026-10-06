import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const tick = () => new Promise(done => setImmediate(done))
// Real module/controller/engine sources, with hardware SDK adapters. No ArkTS compilation/device claim.
async function host(t, options = {}) {
  const calls = { metadata: [], states: [], media: [], logs: [], events: [], destroyed: 0, creating: false }
  const callbacks = new Map(), mediaCallbacks = new Map()
  const session = {
    activate: async () => {}, deactivate: async () => {}, destroy: async () => { calls.destroyed++ },
    on: (name, callback) => callbacks.set(name, callback),
    setAVMetadata: async metadata => {
      if (options.delay) await options.delay(metadata)
      if (options.failMetadata) throw new Error('card unavailable')
      calls.metadata.push(structuredClone(metadata))
    },
    setAVPlaybackState: async state => calls.states.push(structuredClone(state)),
  }
  const player = {
    state: 'idle', currentTime: 0, duration: 42000,
    on: (name, callback) => mediaCallbacks.set(name, callback),
    reset: async () => { player.state = 'idle'; mediaCallbacks.get('stateChange')?.('idle') },
    prepare: async () => { player.state = 'prepared'; mediaCallbacks.get('stateChange')?.('prepared') },
    play: async () => { calls.media.push(['play']); player.state = 'playing'; mediaCallbacks.get('stateChange')?.('playing') },
    pause: async () => { calls.media.push(['pause']); player.state = 'paused'; mediaCallbacks.get('stateChange')?.('paused') },
    stop: async () => { calls.media.push(['stop']); player.state = 'stopped'; mediaCallbacks.get('stateChange')?.('stopped') },
    seek: time => { calls.media.push(['seek', time]); player.currentTime = time; mediaCallbacks.get('seekDone')?.(time) },
    setSpeed: speed => calls.media.push(['speed', speed]),
    setVolume: volume => calls.media.push(['volume', volume]), release: async () => {},
  }
  const globals = {
    Map, Date, Number, Promise, setInterval, clearInterval,
    media: { createAVPlayer: async () => player,
      PlaybackSpeed: { SPEED_FORWARD_0_75_X: .75, SPEED_FORWARD_1_00_X: 1, SPEED_FORWARD_1_25_X: 1.25,
        SPEED_FORWARD_1_75_X: 1.75, SPEED_FORWARD_2_00_X: 2 } },
    LocalAudioSource: class { assign(_player, url) {
      calls.media.push(['load', url]); queueMicrotask(() => mediaCallbacks.get('stateChange')?.('initialized'))
    } close() {} },
    BackgroundTaskManager: class { startBackgroundTask() {} stopBackgroundTask() {} },
    LynxModule: class { constructor(context) { this.context = context } },
    ClientFileLog: { init() {}, truncText: String, truncUrl: String, write: (...values) => calls.logs.push(values) },
    avSession: { createAVSession: async () => {
      calls.creating = true
      if (options.creation) await options.creation
      if (options.failCreate) throw new Error('unavailable')
      return session
    }, PlaybackState: { PLAYBACK_STATE_PLAY: 2, PLAYBACK_STATE_PAUSE: 3, PLAYBACK_STATE_STOP: 6,
      PLAYBACK_STATE_PREPARE: 1, PLAYBACK_STATE_COMPLETED: 7, PLAYBACK_STATE_ERROR: 9, PLAYBACK_STATE_IDLE: 10 },
    LoopMode: { LOOP_MODE_SEQUENCE: 0, LOOP_MODE_SINGLE: 1, LOOP_MODE_LIST: 2, LOOP_MODE_SHUFFLE: 3 } },
  }
  const load = name => {
    const source = readFileSync(new URL('../../harmony/entry/src/main/ets/modules/audio/' + name + '.ets', import.meta.url), 'utf8').replace(/^import .*$/gm, '')
    const result = ts.transpileModule(source, { reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
    assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
    const exports = {}; runInNewContext(result.outputText, { ...globals, exports }); Object.assign(globals, exports)
  }
  load('AVSessionController'); load('SongloftAudioEngine'); load('SongloftAudioModule')
  const context = { sendGlobalEvent: (name, params) => calls.events.push({ name, params: structuredClone(params) }) }
  const module = new globals.SongloftAudioModule(context, {})
  t.after(async () => { module.dispose(); await tick(); globals.SongloftAudioEngine.release(); await tick() })
  if (!options.creation) await tick()
  return { module, calls, callbacks, mediaCallbacks, player, controller: module.sessionController,
    engine: await globals.SongloftAudioEngine.getInstance() }
}
const item = (id, url) => ({ id, url, title: '歌曲 ' + id, artist: '歌手', durationMs: 40000, artworkUrl: 'https://art/' + id })
async function track(h, id) {
  h.module.load('https://song/' + id, { sourceId: String(id), autoplay: false })
  await tick()
}

test('HarmonyOS real source preserves metadata, toggles lyric slots and clears on switch/stop', async t => {
  const h = await host(t)
  h.module.setQueue([item(1, 'https://song/1'), item(2, 'https://song/2')], 0)
  await track(h, 1)
  h.module.updateNotificationLyricWithLayout('歌词🎵', true); await tick()
  const meta = h.calls.metadata.at(-1)
  assert.equal(meta.assetId, '1'); assert.equal(meta.title, '歌词🎵'); assert.equal(meta.subtitle, '歌曲 1')
  assert.equal(meta.artist, '歌手'); assert.equal(meta.duration, 40000); assert.equal(meta.mediaImage, 'https://art/1')
  h.module.updateNotificationLyric('第二句', false); await tick()
  assert.equal(h.calls.metadata.at(-1).title, '歌曲 1'); assert.equal(h.calls.metadata.at(-1).subtitle, '第二句')
  h.module.updateNotificationLyric(null, true); await tick()
  assert.equal(h.calls.metadata.at(-1).title, '歌曲 1'); assert.equal(h.calls.metadata.at(-1).subtitle, '')
  h.module.updateNotificationLyric('旧歌词', true); await track(h, 2)
  assert.equal(h.calls.metadata.at(-1).title, '歌曲 2'); assert.equal(h.calls.metadata.at(-1).subtitle, '')
  h.module.updateNotificationLyric('暂停保留', true); h.module.pause(); await tick()
  assert.equal(h.calls.metadata.at(-1).title, '暂停保留'); assert.equal(h.calls.states.at(-1).state, 3)
  h.module.stop(); await tick()
  assert.equal(h.calls.metadata.at(-1).title, '歌曲 2'); assert.equal(h.calls.states.at(-1).state, 10)
})

test('HarmonyOS commands preserve seek/speed parameters and only send valid Worker commands', async t => {
  const h = await host(t); h.module.setQueue([item(1, 'https://song/1')], 0); await track(h, 1)
  h.callbacks.get('play')(); h.callbacks.get('pause')(); h.callbacks.get('seek')(12345); h.callbacks.get('setSpeed')(1.25)
  h.callbacks.get('playNext')(); h.callbacks.get('playPrevious')(); h.callbacks.get('stop')()
  h.callbacks.get('toggleFavorite')('old'); h.callbacks.get('toggleFavorite')('1')
  await tick()
  assert.ok(h.calls.media.some(c => c[0] === 'play')); assert.ok(h.calls.media.some(c => c[0] === 'pause'))
  assert.ok(h.calls.media.some(c => c[0] === 'seek' && c[1] === 12345))
  assert.ok(h.calls.media.some(c => c[0] === 'speed' && c[1] === 1.25))
  assert.deepEqual(h.calls.events.filter(e => e.name === 'SongloftAudio.remoteCommand').map(e => e.params[0].command), ['next', 'previous', 'stop', 'toggleFavorite'])
  h.module.setVolume(.37); h.module.getVolume(); h.module.setFavorite(true); h.module.setRepeatMode('one'); await tick()
  assert.equal(h.calls.events.filter(e => e.name === 'SongloftAudio.volumeChanged').at(-1).params[0].volume, 37)
  assert.equal(h.calls.states.at(-1).isFavorite, true); assert.equal(h.calls.states.at(-1).loopMode, 1)
  assert.equal(h.calls.states.at(-1).position.elapsedTime, 12345)
  h.module.setShuffle(true); await tick(); assert.equal(h.calls.states.at(-1).loopMode, 3)
})

test('metadata writes remain ordered when an old lyric is delayed; stale progress cannot change new duration', async t => {
  let finish, block = false
  const h = await host(t, { delay: async metadata => { if (block && metadata.title === 'old') await new Promise(done => { finish = done }) } })
  h.module.setQueue([item(1, 'https://song/1'), item(2, 'https://song/2')], 0); await track(h, 1)
  block = true; h.module.updateNotificationLyric('old', true); await tick()
  await track(h, 2); h.module.updateNotificationLyric('new', true)
  h.module.expectedSourceId = '3'; h.mediaCallbacks.get('durationUpdate')(99999)
  finish(); await tick()
  assert.equal(h.calls.metadata.at(-1).title, 'new'); assert.equal(h.calls.metadata.at(-1).assetId, '2')
  assert.equal(h.calls.metadata.at(-1).duration, 40000)
})

test('SDK update/create failures do not reject audio; media errors become source-tagged events', async t => {
  for (const options of [{ failMetadata: true }, { failCreate: true }]) {
    const h = await host(t, options)
    h.module.setQueue([item(1, 'https://song/1')], 0); await track(h, 1)
    assert.ok(h.calls.media.some(c => c[0] === 'load'))
    assert.ok(h.calls.events.some(e => e.name === 'SongloftAudio.sourceReady'))
    assert.ok(h.calls.logs.some(c => c[0] === 'E'))
    h.player.play = async () => { throw new Error('media refused') }
    h.module.play(); await tick()
    assert.ok(h.calls.events.some(e => e.name === 'SongloftAudio.error' && e.params[0].sourceId === '1'))
  }
})

test('disposing during session creation releases the late session and does not bind media callbacks', async t => {
  let finish
  const h = await host(t, { creation: new Promise(done => { finish = done }) })
  await tick()
  assert.equal(h.calls.creating, true)
  h.module.dispose(); finish(); await tick()
  assert.equal(h.controller.session, null)
  assert.equal(h.calls.destroyed, 1)
  h.mediaCallbacks.get('stateChange')('playing'); await tick()
  assert.equal(h.calls.events.length, 0)
})

test('disposal after initialization blocks late progress, volume, commands and pending load', async t => {
  const h = await host(t)
  h.module.setQueue([item(1, 'https://song/1')], 0)
  h.module.load('https://song/1', { sourceId: '1', autoplay: false })
  h.module.getVolume()
  h.module.dispose()
  h.mediaCallbacks.get('durationUpdate')(99999)
  h.callbacks.get('playNext')()
  await tick()
  assert.equal(h.calls.events.length, 0)
  assert.ok(!h.calls.media.some(c => c[0] === 'load'))
  assert.equal(h.calls.destroyed, 1)
})
