import { apiPrefix } from '../../../core/config/app-config.js'
import { getSharedClient } from '../../../core/network/api-client.js'

/** The frame's entry path is supplied by the host, never by the child. */
export async function pluginApiRequest(
  entryPath: string,
  params: Record<string, unknown>,
) {
  const { path, method, body } = params
  if (typeof path !== 'string' || (method !== 'GET' && method !== 'POST'))
    throw new Error('invalid plugin API request')
  const route = path.split('?')[0]
  if (
    !/^\/api(?:\/|$)/.test(route) ||
    /[\\#\s]/.test(path) ||
    /%/.test(route) ||
    route.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error('invalid plugin API path')
  const result = await getSharedClient().request(
    `${apiPrefix}/jsplugin/${encodeURIComponent(entryPath)}${path}`,
    {
      method,
      body,
      receiveTimeoutMs: 60000,
    },
  )
  return result.data
}
