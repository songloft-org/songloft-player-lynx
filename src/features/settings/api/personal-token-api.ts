import { z } from 'zod'
import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getSharedClient } from '../../../core/network/api-client.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import { useAppSessionStore } from '../../../store/app-session.js'

const personalTokenSchema = z.object({
  id: z.string(), name: z.string(), prefix: z.string(), created_at: z.string(),
  last_used_at: z.string().nullable(), revoked_at: z.string().nullable(),
}).transform(t => ({ id: t.id, name: t.name, prefix: t.prefix, createdAt: t.created_at, lastUsedAt: t.last_used_at, revokedAt: t.revoked_at }))
export type PersonalToken = z.infer<typeof personalTokenSchema>
const pageSchema = z.object({ tokens: z.array(personalTokenSchema), total: z.number(), limit: z.number(), offset: z.number() })

/** Pin requests, including auth retries, to the session that opened the page. */
export function personalTokenSession() {
  const session = useAppSessionStore.getState()
  const server = `${appConfig.resolvedBaseUrl}${appConfig.basePath}`
  return {
    key: ['personal-tokens', server, session.username] as const,
    server,
    assertCurrent: () => {
      if (useAppSessionStore.getState() !== session || `${appConfig.resolvedBaseUrl}${appConfig.basePath}` !== server) throw new Error('session_changed')
    },
  }
}

export class PersonalTokenApi {
  constructor(private client: HttpClient, private session: ReturnType<typeof personalTokenSession>) {}
  private get path() { return `${this.session.server}${apiPrefix}/auth/personal-tokens` }
  async list(offset: number) {
    const result = await this.client.get<unknown>(this.path, { query: { limit: 20, offset }, assertCurrent: this.session.assertCurrent })
    this.session.assertCurrent()
    return pageSchema.parse(result.data)
  }
  async create(name: string): Promise<string> {
    const result = await this.client.post<unknown>(this.path, { name: name.trim() }, { assertCurrent: this.session.assertCurrent })
    this.session.assertCurrent()
    // The complete credential must never enter a query/mutation cache or storage.
    return z.object({ token: z.string().startsWith('sl_pat_') }).parse(result.data).token
  }
  async revoke(id: string): Promise<void> {
    await this.client.delete(`${this.path}/${encodeURIComponent(id)}`, { assertCurrent: this.session.assertCurrent })
    this.session.assertCurrent()
  }
}
export function getPersonalTokenApi(session: ReturnType<typeof personalTokenSession>) {
  return new PersonalTokenApi(getSharedClient(), session)
}
