import { addComponentsDir, addImportsDir, addServerHandler, createResolver, defineNuxtModule } from 'nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'pi-conversations' },
  moduleDependencies: { './modules/sessions': {} },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    nuxt.options.alias['#conversations'] = resolver.resolve('./runtime')
    addComponentsDir({ path: resolver.resolve('./runtime/app/components'), pathPrefix: false })
    addImportsDir(resolver.resolve('./runtime/app/composables'))
    nuxt.options.css.push(resolver.resolve('./runtime/app/assets/css/conversation.css'))
    addServerHandler({ route: '/api/conversations', method: 'post', handler: resolver.resolve('./runtime/server/api/conversation.post') })
  },
})
