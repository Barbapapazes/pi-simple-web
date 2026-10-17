import type { MaybeRefOrGetter } from 'vue'
import { sessionQueryOptions } from '#sessions/app/utils/sessionQueryOptions'

export function useSession(id: MaybeRefOrGetter<string>) {
  return useQuery(() => sessionQueryOptions(toValue(id)))
}
