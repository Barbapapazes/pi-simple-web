import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { cleanBuildOutputDir, writeAssets, writeRootConfig, writeWorkerConfig } from '@cloudflare/build-output-utils'
import { loadAndParseConfig } from '@cloudflare/config'

// Adapt Nuxt's generated SPA to cf's prebuilt Build Output Specification.
// Do not invoke cf's framework auto-configuration: it targets Nuxt SSR.
const root = fileURLToPath(new URL('../', import.meta.url))
const sourceDirectory = fileURLToPath(new URL('../.output/public/', import.meta.url))
const context = { mode: 'production', isPreview: false }
const { result } = await loadAndParseConfig(`${root}cloudflare.config.ts`, context)
if (!result.success)
  throw result.error

const { worker, accountId, complianceRegion } = result.data
if (!worker || worker.entrypoint)
  throw new Error('Cloudflare deployment must be assets-only')

await access(`${sourceDirectory}index.html`)
await cleanBuildOutputDir(root)
await writeRootConfig(root, { accountId, complianceRegion }, context)
await writeWorkerConfig({ root, config: worker })
await writeAssets({ root, sourceDirectory })
