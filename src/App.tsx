import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

// Configure the Query no-DOM globals (no-op focus/online managers +
// AbortController existence polyfill) BEFORE the QueryClient is constructed,
// then take the process-wide client. This is the first time batch-2's Query
// layer is mounted into the render tree (roadmap R11): `useInfiniteQuery` in the
// library feature reads this provider's client.
import { initI18n } from './i18n/index.js'
import { configureQueryGlobals, getQueryClient } from './lib/query/index.js'
import { router } from './router.js'

// Initialise i18next synchronously (default language) before the first render
// so `useTranslation()` resolves immediately; the persisted language choice is
// applied asynchronously at startup (see `index.tsx` → `applySavedLanguage`).
initI18n()
configureQueryGlobals()
const queryClient = getQueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
