/**
 * Time-of-day greeting, ported from the Flutter `_GreetingAppBar._getGreeting`
 * (`features/home/presentation/home_page.dart`). Pure + hour-parameterised so it
 * is deterministic under unit test (the page passes `new Date().getHours()`).
 *
 * The Flutter version has five buckets (late-night / morning / noon / afternoon
 * / evening); we fold noon into the afternoon copy for the English strings the
 * app currently ships, keeping four stable, testable branches.
 */
export function greetingForHour(hour: number): string {
  if (hour < 6) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Convenience for the page: greeting for the current local hour. */
export function currentGreeting(now: Date = new Date()): string {
  return greetingForHour(now.getHours())
}
