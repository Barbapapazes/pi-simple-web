import { addServerHandler, createResolver, defineNuxtModule } from 'nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'pi-sessions-api' },
  setup() {
    const resolver = createResolver(import.meta.url)
    addServerHandler({ route: '/api/sessions', method: 'get', handler: resolver.resolve('./runtime/server/api/sessions/index.get') })
    addServerHandler({ route: '/api/sessions/metrics', method: 'get', handler: resolver.resolve('./runtime/server/api/sessions/metrics.get') })
    addServerHandler({ route: '/api/sessions/:id/version', method: 'get', handler: resolver.resolve('./runtime/server/api/sessions/[id]/version.get') })
    addServerHandler({ route: '/api/sessions/:id', method: 'get', handler: resolver.resolve('./runtime/server/api/sessions/[id].get') })
  },
})
