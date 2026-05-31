import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from './queryClient'

export function useHomeQuery() {
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => api.readHome(),
  })
}
