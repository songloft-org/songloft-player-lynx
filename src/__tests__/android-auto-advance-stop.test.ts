import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

const repoRoot = path.resolve(__dirname, '../..')
const enginePath = path.join(
  repoRoot,
  'android/app/src/main/java/org/songloft/lynx/audio/SongloftAudioEngine.kt',
)
const servicePath = path.join(
  repoRoot,
  'android/app/src/main/java/org/songloft/lynx/audio/SongloftPlaybackService.kt',
)

function sourceWithoutComments(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

const engine = sourceWithoutComments(enginePath)
const service = sourceWithoutComments(servicePath)

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  return start >= 0 && end > start ? source.slice(start, end) : ''
}

describe('Android auto-advance does not accept a stale media stop', () => {
  test('the engine arms a short guard only when replacing an ended item', () => {
    const load = between(engine, 'fun load(', 'fun play(')
    expect(load, 'load() body not found').not.toBe('')
    expect(load).toContain('p.playbackState == Player.STATE_ENDED && p.playWhenReady')
    expect(load).toContain('SystemClock.elapsedRealtime() + AUTO_ADVANCE_STOP_GUARD_MS')
    expect(load).toContain('else {\n            0L\n        }')
    expect(engine).toContain('fun consumeAutoAdvanceStopGuard(): Boolean')
  })

  test('explicit stop/release clear the guard and consumption is one-shot', () => {
    const stop = between(engine, 'fun stop()', 'fun seek(')
    const release = between(engine, 'fun release()', 'fun releaseFromService(')
    const consume = between(engine, 'fun consumeAutoAdvanceStopGuard(): Boolean', 'private fun startProgress(')

    expect(stop).toContain('autoAdvanceStopGuardUntilMs = 0L')
    expect(release).toContain('autoAdvanceStopGuardUntilMs = 0L')
    expect(consume).toContain('val deadline = autoAdvanceStopGuardUntilMs')
    expect(consume).toContain('autoAdvanceStopGuardUntilMs = 0L')
    expect(consume).toContain('if (deadline <= SystemClock.elapsedRealtime()) return false')
    expect(consume).toContain('p.playWhenReady && p.playbackState != Player.STATE_IDLE')
  })

  test('the service reads the key event and suppresses only MEDIA_STOP with a guard', () => {
    const onStart = between(service, 'override fun onStartCommand(', 'override fun onUpdateNotification(')
    expect(onStart, 'onStartCommand() body not found').not.toBe('')
    expect(service).toContain('Intent.EXTRA_KEY_EVENT')
    expect(service).toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU')
    expect(onStart).toContain('isMediaNotificationStopIntent(intent)')
    expect(service).toContain('mediaButtonKeyCode(intent) == KeyEvent.KEYCODE_MEDIA_STOP')
    expect(service).toContain('intent?.data != null')
    expect(onStart).toContain('SongloftAudioEngine.consumeAutoAdvanceStopGuard()')
    expect(onStart).toContain('return START_STICKY')
    expect(onStart).toContain('val result = super.onStartCommand(intent, flags, startId)')
  })
})
