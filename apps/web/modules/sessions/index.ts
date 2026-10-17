import { addComponentsDir, addImportsDir, createResolver, defineNuxtModule } from 'nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'pi-sessions' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    nuxt.options.alias['#sessions'] = resolver.resolve('./runtime')
    addComponentsDir({ path: resolver.resolve('./runtime/app/components'), pathPrefix: false })
    addImportsDir(resolver.resolve('./runtime/app/composables'))
    addImportsDir(resolver.resolve('./runtime/app/utils'))
  },
})
