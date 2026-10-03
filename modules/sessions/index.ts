import { addComponentsDir, addImportsDir, addServerHandler, createResolver, defineNuxtModule } from 'nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'pi-sessions' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    nuxt.options.alias['#sessions'] = resolver.resolve('./runtime')
    addComponentsDir({ path: resolver.resolve('./runtime/app/components'), pathPrefix: false })
    addImportsDir(resolver.resolve('./runtime/app/composables'))
    addImportsDir(resolver.resolve('./runtime/app/utils'))
    addServerHandler({ route: '/api/sessions', method: 'get', handler: resolver.resolve('./runtime/server/api/sessions/index.get') })
    addServerHandler({ route: '/api/sessions/:id', method: 'get', handler: resolver.resolve('./runtime/server/api/sessions/[id].get') })
  },
})
