import { createRequire } from 'node:module'

// Resolve from Pi's own dependency tree (also works with pnpm's strict layout).
const requirePi = createRequire(import.meta.resolve('@earendil-works/pi-coding-agent'))

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@comark/nuxt', '@nuxt/ui', '@pinia/nuxt', '@pinia/colada-nuxt'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'system',
  },
  app: {
    head: {
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/pi.svg' }],
    },
  },
  runtimeConfig: {
    piSessionDir: '',
  },
  nitro: {
    externals: {
      // Pi resolves this asset dynamically; Nitro's automatic tracing misses it.
      traceInclude: [requirePi.resolve('quickjs-wasi/quickjs.wasm')],
    },
  },
})
