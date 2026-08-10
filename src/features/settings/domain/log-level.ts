/**
 * Backend log-level domain (Settings → Diagnostics). Mirrors the Flutter
 * `logLevelProvider`: this is a **server-side** setting (`GET/PUT
 * /api/v1/settings/log-level`), not a local-only toggle — the level controls
 * the backend's own log verbosity. Kept pure/framework-free so it stays
 * unit-testable without pulling in i18next or the HTTP client.
 */

/** Ordered from most to least verbose. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

const DEFAULT_LOG_LEVEL: LogLevel = 'info'

/**
 * Coerce an arbitrary server/persisted string into a valid {@link LogLevel},
 * falling back to `info` (mirrors the zod `.catch()` tolerance rule, AGENTS §2:
 * an unexpected/absent value must never throw, just default).
 */
export function coerceLogLevel(raw: string | null | undefined): LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(raw ?? '')
    ? (raw as LogLevel)
    : DEFAULT_LOG_LEVEL
}

/** i18n key for a log-level option's label. */
export function logLevelLabelKey(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return 'settings.logLevelDebug'
    case 'warn':
      return 'settings.logLevelWarn'
    case 'error':
      return 'settings.logLevelError'
    default:
      return 'settings.logLevelInfo'
  }
}
