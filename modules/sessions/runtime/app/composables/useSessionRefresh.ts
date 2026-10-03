// Refresh saved data without instantiating the browsing/filter state.
export function useSessionRefresh() {
  const cache = useQueryCache()
  return () => cache.invalidateQueries({ key: ['sessions'] })
}
