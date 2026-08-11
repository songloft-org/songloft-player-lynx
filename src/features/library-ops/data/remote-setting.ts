import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'

/**
 * Shared plumbing for the six backend-owned scan preferences — batch 19.
 *
 * Five of the six are structurally identical (`GET` → read one field with a
 * default; `PUT` → `{field: value}`), so they share this factory instead of six
 * near-copies. `auto-scan` carries an object value and is specialised separately.
 */

/**
 * A setting plus whether the read fell back.
 *
 * The wrapper exists because a bare `T` cannot distinguish "the server really is
 * set to the default" from "the read failed so we degraded to the default" — and
 * the row has to show a "could not read config" hint only in the latter case.
 */
export interface RemoteSetting<T> {
  value: T
  readFailed: boolean
}

/**
 * Degrade a failed read to the default **inside `queryFn`** rather than letting
 * the query enter its error state.
 *
 * This mirrors the Flutter `AsyncNotifier`s (`try { return await api.getX() }
 * catch { return <default> }`): the query is then always `success` and `data` is
 * never `undefined`, so no call site needs an `?? default` fallback and the UI
 * has no undefined branch. Letting it error instead would also burn the global
 * `retry: 1` before the row could render anything.
 */
export async function remoteSettingQueryFn<T>(
  read: () => Promise<T>,
  fallback: T,
): Promise<RemoteSetting<T>> {
  try {
    return { value: await read(), readFailed: false }
  } catch {
    return { value: fallback, readFailed: true }
  }
}

/** Write an optimistic value into the query cache. */
export function applyOptimistic<T>(
  queryClient: QueryClient,
  key: readonly unknown[],
  next: T,
): void {
  queryClient.setQueryData<RemoteSetting<T>>(key, { value: next, readFailed: false })
}

/** Restore a snapshot captured in `onMutate` (no-op when there was none). */
export function rollback<T>(
  queryClient: QueryClient,
  key: readonly unknown[],
  previous: RemoteSetting<T> | undefined,
): void {
  if (previous) queryClient.setQueryData<RemoteSetting<T>>(key, previous)
}

/** Read a backend setting, degrading a failed read to `fallback`. */
export function useRemoteSetting<T>(
  key: readonly unknown[],
  read: () => Promise<T>,
  fallback: T,
) {
  return useQuery({
    queryKey: key,
    queryFn: () => remoteSettingQueryFn(read, fallback),
    staleTime: 60_000,
  })
}

/**
 * Write a backend setting with an optimistic cache update and rollback.
 *
 * There is deliberately **no `onSettled` invalidate**. These PUTs return no
 * body, so invalidating would immediately re-read via `GET`; if the backend is
 * eventually consistent — or that one read blips — the switch visibly flips back
 * under the user's finger. The optimistic value stays authoritative until the
 * page remounts, which is also what the Flutter version does.
 */
export function useRemoteSettingMutation<T>(
  key: readonly unknown[],
  write: (next: T) => Promise<void>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onMutate: async (next: T) => {
      // An in-flight GET would otherwise land after us and clobber the
      // optimistic value.
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<RemoteSetting<T>>(key)
      applyOptimistic(queryClient, key, next)
      return { previous }
    },
    onError: (_error, _next, context) => {
      rollback(queryClient, key, context?.previous)
    },
  })
}
