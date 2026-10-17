import { addServerHandler, createResolver, defineNuxtModule } from 'nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'pi-conversations-api' },
  setup() {
    const resolver = createResolver(import.meta.url)
    addServerHandler({ route: '/api/conversations', method: 'post', handler: resolver.resolve('./runtime/server/api/conversation.post') })
  },
})
