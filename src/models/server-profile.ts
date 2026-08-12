import { z } from 'zod'
import { makeParsers } from './_shared.js'

export const serverProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  insecure_tls: z.boolean().catch(false),
  last_used: z.number().optional(),
}).transform((p) => ({
  id: p.id,
  name: p.name,
  url: p.url,
  insecureTls: p.insecure_tls,
  lastUsed: p.last_used,
}))

export type ServerProfile = z.output<typeof serverProfileSchema>

export const serverProfileListSchema = z.array(serverProfileSchema)

export const ServerProfile = makeParsers(serverProfileSchema)
export const ServerProfileList = makeParsers(serverProfileListSchema)
