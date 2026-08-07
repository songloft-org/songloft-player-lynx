import { z } from 'zod'

import { makeParsers, nowIso } from './_shared.js'

/** JWT token pair returned by `/auth/login` and `/auth/refresh`. */
export const authTokensSchema = z
  .object({
    access_token: z.string(),
    refresh_token: z.string(),
    expires_in: z.number(),
    token_type: z.string().default('Bearer'),
  })
  .transform((t) => ({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresIn: t.expires_in,
    tokenType: t.token_type,
  }))

export type AuthTokens = z.output<typeof authTokensSchema>

export interface AuthTokensJson {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export function authTokensToJson(t: AuthTokens): AuthTokensJson {
  return {
    access_token: t.accessToken,
    refresh_token: t.refreshToken,
    expires_in: t.expiresIn,
    token_type: t.tokenType,
  }
}

const authTokensParsers = makeParsers(authTokensSchema)
export const parseAuthTokens = authTokensParsers.parse
export const safeParseAuthTokens = authTokensParsers.safeParse

/** A single issued token, for the token-management list. */
export const tokenInfoSchema = z
  .object({
    id: z.number(),
    token_id: z.string(),
    token_type: z.enum(['access', 'refresh']),
    client_info: z.string().nullish(),
    expires_at: z.string(),
    revoked_at: z.string().nullish(),
    created_at: z.string().nullish(),
  })
  .transform((t) => ({
    id: t.id,
    tokenId: t.token_id,
    tokenType: t.token_type,
    clientInfo: t.client_info ?? undefined,
    expiresAt: t.expires_at,
    revokedAt: t.revoked_at ?? undefined,
    createdAt: t.created_at ?? nowIso(),
  }))

export type TokenInfo = z.output<typeof tokenInfoSchema>

const tokenInfoParsers = makeParsers(tokenInfoSchema)
export const parseTokenInfo = tokenInfoParsers.parse
export const safeParseTokenInfo = tokenInfoParsers.safeParse
