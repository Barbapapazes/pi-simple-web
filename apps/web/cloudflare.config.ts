import { defineConfig } from 'cf/config'

export default defineConfig({
  accountId: '791273e4d0a39e921e3dc7a6a76acf61',
  worker: {
    name: 'pi-simple-web',
    compatibilityDate: '2026-10-17',
    // No entrypoint: Cloudflare serves static assets without application code.
    assets: {
      notFoundHandling: 'single-page-application',
    },
    domains: ['barbabot.soubiran.dev'],
    workersDev: false,
    previewUrls: false,
  },
})
