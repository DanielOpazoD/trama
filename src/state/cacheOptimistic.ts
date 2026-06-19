import type { QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query'

export type QuerySnapshot<TData = unknown> = {
  queryKey: QueryKey
  data: TData | undefined
}

export function snapshotQuery<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
): QuerySnapshot<TData> {
  return {
    queryKey,
    data: queryClient.getQueryData<TData>(queryKey),
  }
}

export function restoreQuerySnapshot<TData>(
  queryClient: QueryClient,
  snapshot: QuerySnapshot<TData>,
): void {
  queryClient.setQueryData(snapshot.queryKey, snapshot.data)
}

export function snapshotQueries<TData>(
  queryClient: QueryClient,
  filters: QueryFilters,
): Array<QuerySnapshot<TData>> {
  return queryClient.getQueriesData<TData>(filters).map(([queryKey, data]) => ({
    queryKey,
    data,
  }))
}

export function restoreQueriesSnapshot<TData>(
  queryClient: QueryClient,
  snapshots: Array<QuerySnapshot<TData>>,
): void {
  for (const snapshot of snapshots) restoreQuerySnapshot(queryClient, snapshot)
}
