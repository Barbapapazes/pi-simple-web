import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

// Resolve from Pi's own dependency tree (also works with pnpm's strict layout).
const requirePi = createRequire(import.meta.resolve('@earendil-works/pi-coding-agent'))
// pi-ai exposes ESM-only entry points, so locate its runtime files through Pi's
// dependency search paths rather than resolving an unexported package subpath.
const oauthDir = requirePi.resolve.paths('@earendil-works/pi-ai')
  ?.map(path => join(path, '@earendil-works/pi-ai/dist/auth/oauth'))
  .find(path => existsSync(join(path, 'load.js')))

if (!oauthDir)
  throw new Error('Cannot locate Pi OAuth runtime modules')

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // API-only: disable Nuxt's Vue server renderer.
  experimental: { noVueServer: true },
  runtimeConfig: {
    piSessionDir: '',
  },
  nitro: {
    externals: {
      // Pi resolves these files dynamically; Nitro's automatic tracing misses them.
      traceInclude: [
        requirePi.resolve('quickjs-wasi/quickjs.wasm'),
        ...readdirSync(oauthDir).filter(file => file.endsWith('.js')).map(file => join(oauthDir, file)),
      ],
    },
  },
})
