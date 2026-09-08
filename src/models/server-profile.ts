import { z } from 'zod'
import { makeParsers } from './_shared.js'

/**
 * 服务器档案（多服务器切换）。
 *
 * 与 Flutter `ServerEntry` 对齐的差异：Flutter 把 `password` 一起序列化进
 * SharedPreferences（明文），这里只把**用户名**放进 prefs——密码是机密，
 * 按 profile id 存在 `secure` 命名空间（键 `password_<id>`），与
 * `token_access_<id>` 同层。见 `settings/store/server-store.ts`。
 */
export const serverProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  insecure_tls: z.boolean().catch(false),
  /** 该服务器的登录用户名（可选；密码不在这里，见上方注释）。 */
  username: z.string().optional(),
  last_used: z.number().optional(),
}).transform((p) => ({
  id: p.id,
  name: p.name,
  url: p.url,
  insecureTls: p.insecure_tls,
  username: p.username,
  lastUsed: p.last_used,
}))

export type ServerProfile = z.output<typeof serverProfileSchema>

export const serverProfileListSchema = z.array(serverProfileSchema)

export const ServerProfile = makeParsers(serverProfileSchema)
export const ServerProfileList = makeParsers(serverProfileListSchema)
