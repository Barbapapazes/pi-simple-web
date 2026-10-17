# Pi Simple Web

Local Pi chat and session browser built with Nuxt, [Nuxt UI](https://ui.nuxt.com/), and [Pinia Colada](https://pinia-colada.esm.dev/).

Start a new conversation, continue existing sessions, and watch Pi's text, thinking, and tool results stream live. Browse sessions across workspaces, filter by workspace or search session names/first messages, and inspect transcripts and image attachments. The dashboard uses Nuxt UI, while the conversation rendering follows Pi's terminal: monospace text, full-width prompt bands, bare assistant replies, muted thinking, and state-colored tool panels.

New conversations let you choose a workspace: enter an existing absolute directory path on the server, pick a suggestion from previous sessions, or leave it blank to use the server user's home directory (`~`). Pi uses that workspace for tools, project instructions, and resource discovery, with its configured defaults (model, thinking level, credentials, and tools). Existing conversations resume in their recorded workspace. There are no model selectors. Configure Pi normally through its CLI/configuration before chatting.

Requires Node.js 22.18+ (or Node.js 24) and pnpm.

## Development

```bash
pnpm install
pnpm dev
```

This starts the Nuxt web app on `http://127.0.0.1:3000` and the Nuxt API on `http://127.0.0.1:3001`. Run either separately with `pnpm --filter @pi-simple-web/web dev` or `pnpm --filter @pi-simple-web/api dev`.

The browser calls the API directly using public runtime configuration `NUXT_PUBLIC_API_BASE` (default `http://127.0.0.1:3001`, without `/api`). There is no web API proxy. The API permits `http://127.0.0.1:3000` and `http://localhost:3000` by default. Set `NUXT_ALLOWED_ORIGINS` on the API to a comma-separated list of exact frontend origins (scheme, host, port) for other deployments. Both apps remain Nuxt applications. The API owns all Pi credentials, sessions, workspaces, and agent processes; the frontend does not need Pi installed or configured.

## Session storage

The server-side `@earendil-works/pi-coding-agent` SDK discovers sessions under the server user's `~/.pi/agent/sessions/`. Browsing does not require credentials or a running agent. Sending messages requires a configured Pi model and credentials, just like the CLI. Web sessions load Pi's built-in MCP, codemode, and tool-search extensions, reading servers from the server user's `~/.pi/agent/mcp.json` (or `PI_CODING_AGENT_DIR`) and the trusted workspace's `.pi/mcp.json`. Configure servers and authentication through Pi's CLI; no separate web MCP configuration is needed. Built-in extension exclusions and replacement extensions are honored. MCP connections are closed when each background conversation run finishes.

For a custom directory containing `.jsonl` session files directly (such as a Pi `--session-dir` directory):

```bash
NUXT_PI_SESSION_DIR=/absolute/path/to/sessions pnpm dev
```

The API resolves session IDs to paths discovered by the SDK; it never accepts a session file path from the browser. New conversations accept a workspace directory path, which the server validates before creating a session. Viewing details uses an in-memory `SessionManager`, so legacy format migrations do not rewrite the source file. Sending a message opens the persistent session through the SDK and saves the continued conversation. New sessions are also persistent and honor the custom session directory.

The transcript shows the stored leaf's branch, including pre-compaction history; alternate branches and live, unpersisted CLI state are not shown. Web chat responses are streamed while running. Avoid continuing the same session in the CLI and web app at the same time; simultaneous independent web runs for a session are rejected. While a web response is active, Enter sends a steering message after the current assistant turn and its tools; Alt+Enter queues a follow-up after Pi finishes its pending work (Ctrl+Q is also available on Windows). Shift+Enter inserts a newline. Pending steering and follow-up messages appear above the composer and disappear when delivered; the follow-up button also works without a keyboard. Additional input uses the same live SDK session and stream. Leaving the chat page or closing the browser connection does not interrupt a response: the agent continues in the background and saves the conversation while the server remains running. Reopening a session attaches to its active web run automatically. Dropped streams reconnect with a fresh snapshot, without resending the prompt or restarting the agent. Sessions running only in an external CLI fall back to checking persisted changes. Server shutdowns or restarts stop background runs. Messages and thinking render Markdown through Comark, with HTML, custom components, and arbitrary attributes disabled. Tool output and entry data remain literal text. Tool calls and results are paired by call ID, including parallel calls. Reads show a path and optional line range, with their output available on expansion; shell panels show the last five output lines; writes and other tools preview ten lines. Edit results show colored diffs when recorded. Assistant and user prose is never clipped. Thinking and metadata are collapsible. A compact footer shows the workspace and current Git branch, cumulative input/output and cache read/write tokens, the latest request's cache hit rate, recorded USD cost, context usage/model limit, and automatic compaction status. Billing totals include all branches, summaries, tool-reported model usage, and cache warming, matching Pi's terminal footer. Figures update as web-chat messages finish and when the session refreshes. Context is unknown when the model limit is unavailable or until a successful response after compaction/context edits; browsing reflects current model catalogs, settings, and Git state rather than historical CLI state. Streaming follows the latest output only while you are near the bottom; scrolling up pauses following, with a “Jump to latest” button to resume.

### Browsing performance and live updates

- The dashboard and sidebar share a Pinia Colada infinite query: 30 sessions per page, with server-side search and workspace filtering. Global metrics use a separate Nitro `defineCachedFunction` with a 30-second cache; cache misses still scan sessions.
- Detail requests reuse a server-discovered ID/path index and a bounded, file-versioned cache (up to 32 entries, a 32 MiB estimated budget, and a 30-second TTL). File writes invalidate parsed details; oversized sessions are served without retaining them. Conditional requests use ETags. Git/settings are cached separately for five seconds, and model runtime/catalog initialization is shared for one minute. Live billing totals reuse their previous sum and account for newly persisted entries.
- Active web runs offer `GET /api/conversations/:id/events`. Each observer receives a current snapshot and queue state, followed by batched message-level updates, status events, heartbeats, and a final stored snapshot. Reconnecting does not require an unbounded event replay log. Slow observers coalesce unsent message updates instead of accumulating serialized payloads. Disconnecting an observer never cancels the agent.
- Idle pages check only the session file version and cached environment, backing off to once a minute. Changed files trigger a detail refresh. Hidden pages stop checks and detach GET observers; visible pages reconnect. Streams submitted by this browser can continue across navigation.
- The transcript initially mounts the latest 60 display entries; scrolling upward or choosing **Load older messages** reveals more while preserving scroll position. Unchanged historical messages retain presentation identity during streaming. Thinking/metadata content is mounted only when expanded, and long diffs are previewed. This is progressive rendering, not server-side transcript pagination: initial detail/reconnect snapshots still contain the full active branch.

Agent ownership and reconnect registries are process-local. Run a **single API process**; multiple workers/replicas would require coordinated writer ownership and shared stream routing, not just a shared Nitro cache. Server restarts cannot resume an interrupted agent run. Disable reverse-proxy buffering for SSE.

**Security:** Pi can execute commands and modify files using the configured tools. Choosing a workspace is not a sandbox or a restriction on file access. Sessions can contain secrets, source code, and command output. This app has no authentication. Development binds to `127.0.0.1`; keep production on loopback too. Do not expose it publicly without adding authentication and access control. Remote hosting cannot read sessions from your laptop unless you supply them to the server.

## Production

### Cloudflare static frontend (barbabot.soubiran.dev)

The frontend deploys with Cloudflare's [`cf` CLI](https://blog.cloudflare.com/cloudflare-cf-cli-launch/). `apps/web/cloudflare.config.ts` configures the custom domain `barbabot.soubiran.dev`, disables `workers.dev` and preview URLs, and enables SPA fallback for deep links such as `/sessions/:id`. There is no Worker entrypoint or SSR: only Nuxt's generated `.output/public` assets are uploaded. The API is **not** deployed to Cloudflare.

Use Node.js 22.18+ (or 24) and install dependencies with `pnpm install`. Authenticate once:

```bash
pnpm --filter @pi-simple-web/web exec cf auth login
```

For non-interactive deployments, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment instead. The token needs Workers Scripts Edit and Workers Routes Edit for the target account/zone. The `soubiran.dev` zone must be active in that Cloudflare account, and the custom hostname must not conflict with an existing DNS record or service.

```bash
# Build and validate without credentials or uploading anything:
pnpm deploy:web:check

# Generate the SPA and deploy production to the configured custom domain:
NUXT_PUBLIC_API_BASE=https://your-api.example.com pnpm deploy:web
```

Replace the example API origin with the address reachable from visitors' browsers (without `/api`). Unlike the optional Node frontend below, static hosting bakes `NUXT_PUBLIC_API_BASE` into assets **at build time**; changing it requires rebuilding and redeploying. If omitted, it remains `http://127.0.0.1:3001`, meaning the visitor's own machine, not the Cloudflare host. Set `NUXT_ALLOWED_ORIGINS=https://barbabot.soubiran.dev` on the separately hosted API. Use HTTPS for a hosted API and protect it with authentication/access control; CORS alone is not protection.

The pinned `cf` beta does not accept an asset source directory in `cloudflare.config.ts`. `apps/web/scripts/build-cloudflare.ts` uses Cloudflare's build-output utilities to package the generated assets into `.cloudflare/output/v0`, then `cf deploy --prebuilt` deploys that output. Use the scripts above rather than bare `cf deploy`, whose automatic Nuxt configuration targets a server build. This setup does not create preview deployments or deploy pull requests.

Cloudflare Workers Builds is connected to `Barbapapazes/pi-simple-web`, branch `main`, for the existing `pi-simple-web` service. Its repository root is `/`, build command is `pnpm --filter @pi-simple-web/web build:cloudflare`, and deploy command is `cd apps/web && pnpm exec cf deploy --prebuilt`. Previews are disabled. Keep `NUXT_PUBLIC_API_BASE` in the production build environment; pushes to `main` rebuild and deploy automatically.

### Optional Node-hosted frontend and API

Build both apps in CI with `pnpm build`, or independently with `pnpm build:web` and `pnpm build:api`. Deploy each app's self-contained `.output` directory to its own host. With Node.js 24, start them independently:

```bash
# API host, running as the user with Pi configured:
HOST=127.0.0.1 PORT=3001 node apps/api/.output/server/index.mjs

# Web host (use the API address reachable from browsers and this host):
HOST=127.0.0.1 PORT=3000 NUXT_PUBLIC_API_BASE=http://127.0.0.1:3001 \
  node apps/web/.output/server/index.mjs
```

`NUXT_PUBLIC_API_BASE` must be reachable from browsers. The frontend has SSR disabled. For this Node-hosted option it is public runtime configuration, read at web server startup without rebuilding (unlike the static Cloudflare deployment above). Set `NUXT_ALLOWED_ORIGINS=https://chat.example.com` on the API for a frontend at that origin; use HTTPS for both when the frontend is HTTPS. SSE and queued input go directly to the API. **Neither app has authentication**: protect both behind compatible access control, including preflight requests. CORS is not authentication and does not restrict non-browser clients. Do not expose the API publicly without access control.

### Download prebuilt bundles

The **Build production artifact** GitHub Actions workflow builds on pushes to `main`, pull requests targeting `main`, and manual dispatch. Each successful run uploads `pi-simple-web-linux-x64` and `pi-simple-web-linux-arm64`, retained for 30 days. Each artifact contains two independently deployable archives:

- `pi-simple-web-linux-ARCH.tar.gz`: frontend server and client assets.
- `pi-simple-api-linux-ARCH.tar.gz`: API server and runtime dependencies, including Pi's QuickJS WASM.

CI runs lint, unit tests, and type checks for both apps, builds on native runners, then moves both bundles outside the checkout. Smoke tests exercise the standalone API and web app, CORS allowlisting and preflights, and a real codemode tool call without model credentials.

On Linux x64 or ARM64 with Node.js 24 and an authenticated [GitHub CLI](https://cli.github.com/):

```bash
REPO=Barbapapazes/pi-simple-web
case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64) ARCH=arm64 ;;
  *) echo "Unsupported architecture" >&2; exit 1 ;;
esac
RUN_ID=$(gh run list --repo "$REPO" --workflow build-artifact.yml \
  --branch main --event push --status success --limit 1 \
  --json databaseId --jq '.[0].databaseId // empty')
test -n "$RUN_ID" || { echo 'No successful main build found' >&2; exit 1; }
gh run download "$RUN_ID" --repo "$REPO" --name "pi-simple-web-linux-$ARCH"
mkdir -p web api
tar -xzf "pi-simple-web-linux-$ARCH.tar.gz" -C web
tar -xzf "pi-simple-api-linux-$ARCH.tar.gz" -C api
HOST=127.0.0.1 PORT=3001 node api/.output/server/index.mjs
# In another terminal (or on the frontend host):
HOST=127.0.0.1 PORT=3000 NUXT_PUBLIC_API_BASE=http://127.0.0.1:3001 \
  node web/.output/server/index.mjs
```

Alternatively, download the artifact ZIP from **Actions → Artifacts**, unzip it, and extract each archive on its target host. No source checkout or package installation is required. Bundles exclude Pi credentials, settings, and sessions; configure those only on the API host. `NUXT_PI_SESSION_DIR` is an API setting. The API user's home directory is the default workspace.

Choose the native artifact matching each host's architecture. These Linux bundles are not intended for macOS or Windows. To update, stop the affected process, extract into a fresh directory, and restart; keep the previous directory for rollback. Restarting the API interrupts active conversations.

### PM2

From the directory containing the extracted `api/` and `web/` bundles, with PM2 installed:

```bash
HOST=127.0.0.1 PORT=3001 NODE_ENV=production \
  pm2 start api/.output/server/index.mjs --name pi-simple-api --cwd "$PWD"
HOST=127.0.0.1 PORT=4001 NODE_ENV=production NUXT_PUBLIC_API_BASE=http://127.0.0.1:3001 \
  pm2 start web/.output/server/index.mjs --name pi-simple-web --cwd "$PWD"
pm2 save
```

For separate hosts, set the web host's `NUXT_PUBLIC_API_BASE` to the browser-reachable API origin and the API's `NUXT_ALLOWED_ORIGINS` to the frontend origin. For the PM2 example on web port 4001, set `NUXT_ALLOWED_ORIGINS=http://127.0.0.1:4001` on the API. When migrating an existing single-app PM2 process, stop and delete its old entry before starting the new paths.

## Checks

ESLint uses [`@antfu/eslint-config`](https://github.com/antfu/eslint-config) for TypeScript, Vue, and code style. Run `pnpm lint:fix` to apply automatic fixes.

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## Code organization

This pnpm workspace contains:

- `apps/web/`: the Nuxt frontend, application shell, route wrappers, public assets, UI-only sessions/conversations modules..
- `apps/api/`: the server-only Nuxt application, API handlers, session services, agent runs, and input queues. Local modules register the original API routes.
- `packages/shared/`: framework-independent conversation/session contracts, presentation helpers, Markdown options, and keyboard shortcuts. Both apps import explicit `@pi-simple-web/shared/*` exports; this package has no Pi SDK dependency.
- `tests/`: existing behavior tests, running directly with Node.
- `scripts/`: production bundle smoke tests run exclusively in CI.

Frontend modules register components, composables, and styles and use `#sessions`/`#conversations` aliases for cross-module UI imports. Their `runtime/app/` structure and Tailwind source scanning are preserved. Backend modules contain only `runtime/server/` code. No frontend code imports backend services.

Page routes remain `/`, `/new`, and `/sessions/:id`. API routes are `GET /api/sessions` (paginated), `GET /api/sessions/metrics`, `GET /api/sessions/:id`, `GET /api/sessions/:id/version`, `GET /api/conversations/:id/events`, and `POST /api/conversations`.
