import { z } from 'zod'

/** ISO-8601 timestamp for "now" — used when the backend omits a date field
 * (mirrors the Flutter models' `DateTime.now()` fallback). */
export function nowIso(): string {
  return new Date().toISOString()
}

/** A parsed model bundle: the zod schema plus strict/loose parse helpers. */
export interface ModelParsers<S extends z.ZodTypeAny> {
  schema: S
  /** Throws a `ZodError` on invalid input. */
  parse: (data: unknown) => z.output<S>
  /** Never throws; returns a discriminated `{ success, data | error }`. */
  safeParse: (data: unknown) => z.ZodSafeParseResult<z.output<S>>
}

export function makeParsers<S extends z.ZodTypeAny>(schema: S): ModelParsers<S> {
  return {
    schema,
    parse: (data: unknown) => schema.parse(data) as z.output<S>,
    safeParse: (data: unknown) =>
      schema.safeParse(data) as z.ZodSafeParseResult<z.output<S>>,
  }
}
