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
    // `effectiveForeground` is the value the service both records as ownership
    // and passes to super as `startInForegroundRequired` (it OR-s in media3's
    // will-show signal so a paused-but-shown card is not overwritten by the
    // placeholder — the original bug). The gate's load-bearing property is that
    // this assignment precedes the super call, whose foreground path re-enters
    // onStartCommand synchronously enough that a later assignment loses the race.
    const assignment = onUpdate.indexOf('mediaNotificationOwnsSlot = effectiveForeground')
    const delegation = onUpdate.indexOf('super.onUpdateNotification')
    expect(assignment, 'ownership must be recorded from the effective foreground flag').toBeGreaterThan(-1)
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

/**
 * Gates for the watchdog that re-posts the player card after it is removed from
 * outside the app (issue #2, HyperOS).
 *
 * Owning the slot is not being in the shade. At the end of a track media3 hands
 * the foreground slot back, auto-advance loads the next item, media3 takes the
 * slot again — and HyperOS answers that burst by dropping the media notification
 * *after* the new card was posted (the exported log has the card re-posted at
 * +0.545s and media3's delete intent, which only fires for a notification that
 * actually left the shade, arriving at +1.181s). The stale STOP is suppressed so
 * audio survives; `mediaNotificationOwnsSlot` and media3's `startedInForeground`
 * both still claim the card is up, so nobody re-posts it. A track without synced
 * lyrics triggers no further notification update, and the shade stays empty —
 * 77 seconds in the reported log, until the user hit next themselves.
 *
 * These gates pin the properties that make the repair correct rather than
 * merely present: the judgement comes from outside our own bookkeeping, the
 * placeholder does not pass for the card, the repair only runs while playing
 * (Android 13+ lets users dismiss a foreground-service notification, and
 * fighting that is worse than the bug), it goes through media3's funnel instead
 * of hand-rolling a notification, and it gives up rather than looping on a ROM
 * that will not report our own notifications back to us.
 */
describe('the media notification is re-posted when it is removed from outside the app', () => {
  const verifyBody = /private fun verifyMediaNotification\([\s\S]*?\n {4}\}/.exec(code)?.[0] ?? ''
  const cardInShadeBody = /private fun mediaCardInShade\(\)[\s\S]*?\n {4}\}/.exec(code)?.[0] ?? ''

  test('the watchdog source was parsed (guard against a silent empty match)', () => {
    expect(verifyBody, 'verifyMediaNotification() body not found').toContain('mediaCardInShade')
    expect(cardInShadeBody, 'mediaCardInShade() body not found').toContain('return')
  })

  test('presence is read from the notification manager, not from our own flags', () => {
    // mediaNotificationOwnsSlot mirrors media3, and media3 was wrong too: both
    // still said "posted" while the shade was empty. Only the notification
    // manager knows.
    expect(
      cardInShadeBody,
      'the card-present judgement must come from NotificationManager.activeNotifications; '
        + 'mediaNotificationOwnsSlot and media3 startedInForeground were both stale in issue #2',
      // Anchored on the property read: `activeNotificationsReadable` (the
      // log-once latch) lives in this same body and would satisfy a bare
      // /activeNotifications/ even with the real read deleted.
    ).toMatch(/\.activeNotifications\b/)
    expect(
      cardInShadeBody,
      'match the media3 notification id (1001) among the active notifications',
    ).toMatch(/\.id == PLACEHOLDER_NOTIFICATION_ID/)
    expect(
      cardInShadeBody,
      'getActiveNotifications() is API 23; minSdk here is 21, so the read needs a version guard',
    ).toMatch(/Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.M/)
  })

  test('our own placeholder does not pass for the player card', () => {
    // Both live on id 1001. An id-only check would call a stuck blank
    // placeholder "card present" — the exact state pitfalls §3 documents as
    // invisible from inside the process without reading the channel.
    expect(
      cardInShadeBody,
      'distinguish the card from the placeholder by channel, like dumpsys notification does',
    ).toContain('PLACEHOLDER_CHANNEL_ID')
  })

  test('an unreadable notification manager reports "present", never a blind re-post', () => {
    // Three ways to have no judgement: pre-API-23, no notification service, or
    // a ROM that throws. All three must read as "card is there" so the watchdog
    // stays silent instead of re-posting into the dark.
    const guardedBailouts = cardInShadeBody.match(/return true/g) ?? []
    expect(
      guardedBailouts.length,
      'the version/unreadable guard and the missing-service fallback must both return true',
    ).toBeGreaterThanOrEqual(2)
    const catchBlock = /catch \([^)]*\) \{[\s\S]*?\n {8}\}/.exec(cardInShadeBody)?.[0] ?? ''
    expect(catchBlock, 'a throwing ROM must not take the service down').not.toBe('')
    expect(
      catchBlock,
      'the catch must evaluate to true (present) rather than false, or one SecurityException '
        + 'turns the watchdog into a re-post loop',
    ).toMatch(/\n\s+true\n {8}\}$/)
    expect(
      catchBlock,
      'latch the read off after the first throw: this runs on a timer and the exported log has '
        + 'to stay readable',
    ).toMatch(/activeNotificationsReadable = false/)
  })

  test('the repair only runs while the player is playing', () => {
    const playingGate = verifyBody.search(/if \(!isPlayingNow\(/)
    const repair = verifyBody.indexOf('onUpdateNotification')
    expect(playingGate, 'verifyMediaNotification must gate on isPlayingNow').toBeGreaterThan(-1)
    expect(
      playingGate,
      'the isPlaying gate must precede the re-post: since Android 13 users may dismiss a '
        + 'foreground-service notification, and while playing media3 delete intent stops '
        + 'playback — so "playing but no card" is the only state that is ours to repair',
    ).toBeLessThan(repair)
  })

  test('the repair never runs when media3 itself would show nothing', () => {
    // onUpdateNotification is not "post the card" — it is media3's decision
    // point. With shouldShowNotification false it takes the other branch and
    // *removes* the notification while giving up the foreground slot. Calling
    // it unguarded would turn the watchdog into the very failure it repairs.
    const willShowGate = verifyBody.search(/if \(!mediaNotificationWillShow\(/)
    const repair = verifyBody.indexOf('onUpdateNotification')
    expect(willShowGate, 'verifyMediaNotification must gate on mediaNotificationWillShow')
      .toBeGreaterThan(-1)
    expect(willShowGate, 'the gate must precede the re-post').toBeLessThan(repair)
  })

  test('the repair goes through media3 own notification funnel', () => {
    expect(
      verifyBody,
      'repair by calling onUpdateNotification(session, true) so media3 rebuilds the card from '
        + 'the session (artwork, actions, lyric line) and the ownership flag is realigned',
    ).toMatch(/onUpdateNotification\(\s*session,[\s\S]*?true/)
    expect(
      verifyBody,
      'the placeholder is a blank silent bridge notification, not a repair: posting it here '
        + 'would replace a missing card with an empty one',
    ).not.toContain('startForegroundPlaceholder')
  })

  test('a suppressed stale MEDIA_STOP triggers a check instead of only trusting the heartbeat', () => {
    const suppression =
      /consumeAutoAdvanceStopGuard\(\)[\s\S]*?return START_STICKY/.exec(code)?.[0] ?? ''
    expect(suppression, 'stale MEDIA_STOP suppression branch not found').toContain('START_STICKY')
    expect(
      suppression,
      'that intent is media3 delete intent: it only fires for a notification that already left '
        + 'the shade, so it is the earliest signal the card is gone',
    ).toMatch(/scheduleWatchdog\(/)
  })

  test('re-posts are floored, capped and stop by themselves', () => {
    expect(verifyBody, 'two triggers must not both re-post').toContain('MIN_REPOST_INTERVAL_MS')
    expect(
      verifyBody,
      'cap blind re-posts: a ROM that never reports our notification back would otherwise be '
        + 're-posted at every tick for the whole song',
    ).toContain('MAX_BLIND_REPOSTS')
    expect(code).toMatch(/MAX_BLIND_REPOSTS\s*=\s*\d+/)
    expect(
      code,
      'the watchdog period is a constant so it can be tuned without touching the logic',
    ).toMatch(/WATCHDOG_INTERVAL_MS\s*=\s*10_000L/)
  })

  test('the watchdog does not outlive the service', () => {
    const onDestroy = /override fun onDestroy\(\)[\s\S]*?\n {4}\}/.exec(code)?.[0] ?? ''
    expect(onDestroy, 'onDestroy body not found').toContain('super.onDestroy')
    expect(
      onDestroy,
      'a queued tick after release would read a released session on the main looper',
    ).toMatch(/removeCallbacks\(watchdogTick\)/)
  })
})
