/**
 * Time-of-day greeting, ported from the Flutter `_GreetingAppBar._getGreeting`
 * (`features/home/presentation/home_page.dart`). Pure + hour-parameterised so it
 * is deterministic under unit test (the page passes `new Date().getHours()`).
 *
 * Returns an **i18n key** (not English copy) so the page can localise it via
 * `t(...)`. The Flutter version has five buckets (late-night / morning / noon /
 * afternoon / evening); we fold noon into the afternoon bucket, keeping four
 * stable, testable branches mapped to `home.greeting*` keys.
 */
export type GreetingKey =
  | 'home.greetingNight'
  | 'home.greetingMorning'
  | 'home.greetingAfternoon'
  | 'home.greetingEvening'

export function greetingKeyForHour(hour: number): GreetingKey {
  if (hour < 6) return 'home.greetingNight'
  if (hour < 12) return 'home.greetingMorning'
  if (hour < 18) return 'home.greetingAfternoon'
  return 'home.greetingEvening'
}

/** Convenience for the page: greeting key for the current local hour. */
export function currentGreetingKey(now: Date = new Date()): GreetingKey {
  return greetingKeyForHour(now.getHours())
}
