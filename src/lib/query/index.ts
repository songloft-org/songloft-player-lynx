// Ensure the no-DOM manager no-ops are installed as soon as anything imports
// the query layer (side effect), before any QueryClient is constructed.
import { configureQueryGlobals } from './query-client.js'

configureQueryGlobals()

export {
  configureQueryGlobals,
  createQueryClient,
  getQueryClient,
  defaultQueryClientConfig,
} from './query-client.js'
export { QueryClient } from '@tanstack/query-core'
