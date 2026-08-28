import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Gates for the media notification's ownership of notification id 1001.
 *
 * Two parties post there. media3's `DefaultMediaNotificationProvider` uses
 * `DEFAULT_NOTIFICATION_ID = 1001` for the MediaStyle player card, and
 * `SongloftPlaybackService` posts a placeholder on the same id to satisfy the
 * 5-second `startForegroundService` deadline (a slow `load()` otherwise dies
 * with `ForegroundServiceDidNotStartInTimeException`). Sharing the id is
 * deliberate — it is what lets media3's notification *replace* the placeholder
 * instead of appearing beside it.
 *
 * The trap is that the sharing cuts both ways, and media3 posts **through this
 * service**: `MediaNotificationManager`'s foreground path is
 * `ContextCompat.startForegroundService(service, selfIntent)` followed by
 * `setForegroundServiceNotification(...)`, so every notification update while
 * playing re-enters `onStartCommand` *after* the MediaStyle notification was
 * set. An unconditional placeholder therefore overwrote the player card within
 * milliseconds, for the whole song, every song — measured on device: the shade
 * held the blank silent "Songloft" placeholder while playing and only showed
 * the real card while **paused** (the paused path is `notify()`, which does not
 * self-start the service).
 *
 * Nothing else can catch this. The service compiles, starts, plays, logs
 * nothing unusual, and `dumpsys notification` is the only place the loss is
 * visible. So these gates pin the three properties the fix rests on.
 *
 * Comments are stripped before matching: the class docstring explains this very
 * mechanism, naming `startForegroundPlaceholder()` and `onStartCommand` in
 * prose. A substring check would read the explanation as the implementation —
 * the same false-green the back-key and pbxproj gates hit.
 */

const repoRoot = path.resolve(__dirname, '../..')
const servicePath =
  'android/app/src/main/java/org/songloft/lynx/audio/SongloftPlaybackService.kt'

const code = readFileSync(path.join(repoRoot, servicePath), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('the media notification keeps notification id 1001 while playing', () => {
  test('the service source was parsed (guard against a silent empty match)', () => {
    // Without this, a moved file or an over-eager comment strip turns every
    // assertion below into a match against an empty string.
    expect(code, 'SongloftPlaybackService.kt has no code left after stripping comments').toContain(
      'class SongloftPlaybackService',
    )
    expect(code).toContain('override fun onStartCommand')
  })

  test('the placeholder shares media3 default notification id', () => {
    // 1001 is DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID. A
    // different id does not merely change a number: the placeholder stops being
    // replaced and becomes a second, permanent notification next to the player.
    expect(
      code,
      'the placeholder must use media3 DEFAULT_NOTIFICATION_ID (1001) so the media '
        + 'notification replaces it rather than joining it',
    ).toMatch(/PLACEHOLDER_NOTIFICATION_ID\s*=\s*1001\b/)
  })

  test('the placeholder is only posted while media3 does not hold the slot', () => {
    const onStartCommand = /override fun onStartCommand\([\s\S]*?\n {4}\}/.exec(code)?.[0] ?? ''
    expect(onStartCommand, 'onStartCommand body not found').toContain('super.onStartCommand')
    expect(
      onStartCommand,
      'onStartCommand must not post the placeholder unconditionally: media3 re-enters here '
        + 'right after posting the player card, so an unguarded placeholder erases it',
    ).toMatch(/if\s*\(\s*!mediaNotificationOwnsSlot\s*\)\s*startForegroundPlaceholder\(\)/)
  })

  test('ownership is recorded from media3 own update, before delegating', () => {
    const onUpdate =
      /override fun onUpdateNotification\([\s\S]*?\n {4}\}/.exec(code)?.[0] ?? ''
    expect(
      onUpdate,
      'override onUpdateNotification(session, startInForegroundRequired): it is media3 single '
        + 'funnel for showing, updating and dropping the media notification, and the only place '
        + 'this service can learn who owns id 1001',
    ).toContain('super.onUpdateNotification')
    const assignment = onUpdate.indexOf('mediaNotificationOwnsSlot = startInForegroundRequired')
    const delegation = onUpdate.indexOf('super.onUpdateNotification')
    expect(assignment, 'ownership must be taken from startInForegroundRequired').toBeGreaterThan(-1)
    expect(
      assignment,
      'assign the ownership flag BEFORE calling super: super delegates to media3, whose '
        + 'foreground path self-starts the service and re-enters onStartCommand synchronously '
        + 'enough that a later assignment loses the race',
    ).toBeLessThan(delegation)
  })

  test('a placeholder with nothing to replace it is taken down', () => {
    // media3 shows no notification for an idle or empty player, and its
    // `maybeStopForegroundService` only cancels id 1001 when media3 itself had
    // posted there. A placeholder put up for a `load()` that then failed would
    // otherwise sit in the shade forever — blank, silent and ONGOING|NO_CLEAR,
    // i.e. not dismissable by the user either.
    expect(code, 'clearPlaceholder() must exist to take an orphaned placeholder down').toMatch(
      /private fun clearPlaceholder\(\)[\s\S]*?stopForeground\(/,
    )
    expect(
      code,
      'the "will media3 show anything" test must read the session player state rather than '
        + 'tracking it, so it cannot drift from MediaNotificationManager.shouldShowNotification',
    ).toMatch(/playbackState != Player\.STATE_IDLE[\s\S]*?currentTimeline\.isEmpty\(\)/)
  })
})
