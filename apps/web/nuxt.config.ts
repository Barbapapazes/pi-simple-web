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
    // Server-only: browsers always use the web app's same-origin /api proxy.
    apiBase: 'http://127.0.0.1:3001',
  },
})
