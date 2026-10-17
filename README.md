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

The browser continues to use same-origin `/api/*` requests. The web app streams them to the API using server-only `NUXT_API_BASE` (default `http://127.0.0.1:3001`). Set it to the API's reachable HTTP(S) address when deploying separately; no frontend rebuild or browser CORS configuration is needed. Both apps remain Nuxt applications. The API owns all Pi credentials, sessions, workspaces, and agent processes; the frontend does not need Pi installed or configured.

## Session storage

The server-side `@earendil-works/pi-coding-agent` SDK discovers sessions under the server user's `~/.pi/agent/sessions/`. Browsing does not require credentials or a running agent. Sending messages requires a configured Pi model and credentials, just like the CLI. Web sessions load Pi's built-in MCP, codemode, and tool-search extensions, reading servers from the server user's `~/.pi/agent/mcp.json` (or `PI_CODING_AGENT_DIR`) and the trusted workspace's `.pi/mcp.json`. Configure servers and authentication through Pi's CLI; no separate web MCP configuration is needed. Built-in extension exclusions and replacement extensions are honored. MCP connections are closed when each background conversation run finishes.

For a custom directory containing `.jsonl` session files directly (such as a Pi `--session-dir` directory):

```bash
NUXT_PI_SESSION_DIR=/absolute/path/to/sessions pnpm dev
```

The API resolves session IDs to paths discovered by the SDK; it never accepts a session file path from the browser. New conversations accept a workspace directory path, which the server validates before creating a session. Viewing details uses an in-memory `SessionManager`, so legacy format migrations do not rewrite the source file. Sending a message opens the persistent session through the SDK and saves the continued conversation. New sessions are also persistent and honor the custom session directory.

The transcript shows the stored leaf's branch, including pre-compaction history; alternate branches and live, unpersisted CLI state are not shown. Web chat responses are streamed while running. Avoid continuing the same session in the CLI and web app at the same time; simultaneous independent web runs for a session are rejected. While a web response is active, Enter sends a steering message after the current assistant turn and its tools; Alt+Enter queues a follow-up after Pi finishes its pending work (Ctrl+Q is also available on Windows). Shift+Enter inserts a newline. Pending steering and follow-up messages appear above the composer and disappear when delivered; the follow-up button also works without a keyboard. Additional input uses the same live SDK session and stream. Leaving the chat page or closing the browser connection does not interrupt a response: the agent continues in the background and saves the conversation while the server remains running. Reopen or refresh the session to see persisted progress; live streams are not reattached automatically. Server shutdowns or restarts stop background runs. Messages and thinking render Markdown through Comark, with HTML, custom components, and arbitrary attributes disabled. Tool output and entry data remain literal text. Tool calls and results are paired by call ID, including parallel calls. Reads show a path and optional line range, with their output available on expansion; shell panels show the last five output lines; writes and other tools preview ten lines. Edit results show colored diffs when recorded. Assistant and user prose is never clipped. Thinking and metadata are collapsible. A compact footer shows the workspace and current Git branch, cumulative input/output and cache read/write tokens, the latest request's cache hit rate, recorded USD cost, context usage/model limit, and automatic compaction status. Billing totals include all branches, summaries, tool-reported model usage, and cache warming, matching Pi's terminal footer. Figures update as web-chat messages finish and when the session refreshes. Context is unknown when the model limit is unavailable or until a successful response after compaction/context edits; browsing reflects current model catalogs, settings, and Git state rather than historical CLI state. Streaming follows the latest output only while you are near the bottom; scrolling up pauses following, with a “Jump to latest” button to resume.

**Security:** Pi can execute commands and modify files using the configured tools. Choosing a workspace is not a sandbox or a restriction on file access. Sessions can contain secrets, source code, and command output. This app has no authentication. Development binds to `127.0.0.1`; keep production on loopback too. Do not expose it publicly without adding authentication and access control. Remote hosting cannot read sessions from your laptop unless you supply them to the server.

## Production

Build both apps in CI with `pnpm build`, or independently with `pnpm build:web` and `pnpm build:api`. Deploy each app's self-contained `.output` directory to its own host. With Node.js 24, start them independently:

```bash
# API host, running as the user with Pi configured:
HOST=127.0.0.1 PORT=3001 node apps/api/.output/server/index.mjs

# Web host (use the API address reachable from this host):
HOST=127.0.0.1 PORT=3000 NUXT_API_BASE=http://127.0.0.1:3001 \
  node apps/web/.output/server/index.mjs
```

`NUXT_API_BASE` is the API origin without `/api`. It is read at server startup, not embedded in the browser bundle. When deploying on different hosts, use a private network or authenticated TLS tunnel for the API connection and bind the API to the appropriate private interface. **Neither app has authentication**: protect both behind access control and do not expose the API publicly. Same-origin request checks remain enabled, and the web proxy preserves streaming and queued conversation input.

### Download prebuilt bundles

The **Build production artifact** GitHub Actions workflow builds on pushes to `main`, pull requests targeting `main`, and manual dispatch. Each successful run uploads `pi-simple-web-linux-x64` and `pi-simple-web-linux-arm64`, retained for 30 days. Each artifact contains two independently deployable archives:

- `pi-simple-web-linux-ARCH.tar.gz`: frontend server and client assets.
- `pi-simple-api-linux-ARCH.tar.gz`: API server and runtime dependencies, including Pi's QuickJS WASM.

CI runs lint, unit tests, and type checks for both apps, builds on native runners, then moves both bundles outside the checkout. Smoke tests exercise the standalone API and web app, same-origin protection, streaming, queued input, and a real codemode tool call without model credentials.

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
HOST=127.0.0.1 PORT=3000 NUXT_API_BASE=http://127.0.0.1:3001 \
  node web/.output/server/index.mjs
```

Alternatively, download the artifact ZIP from **Actions → Artifacts**, unzip it, and extract each archive on its target host. No source checkout or package installation is required. Bundles exclude Pi credentials, settings, and sessions; configure those only on the API host. `NUXT_PI_SESSION_DIR` is an API setting. The API user's home directory is the default workspace.

Choose the native artifact matching each host's architecture. These Linux bundles are not intended for macOS or Windows. To update, stop the affected process, extract into a fresh directory, and restart; keep the previous directory for rollback. Restarting the API interrupts active conversations.

### PM2

From the directory containing the extracted `api/` and `web/` bundles, with PM2 installed:

```bash
HOST=127.0.0.1 PORT=3001 NODE_ENV=production \
  pm2 start api/.output/server/index.mjs --name pi-simple-api --cwd "$PWD"
HOST=127.0.0.1 PORT=4001 NODE_ENV=production NUXT_API_BASE=http://127.0.0.1:3001 \
  pm2 start web/.output/server/index.mjs --name pi-simple-web --cwd "$PWD"
pm2 save
```

For separate hosts, run only the corresponding process and set the web host's `NUXT_API_BASE` accordingly. When migrating an existing single-app PM2 process, stop and delete its old entry before starting the new paths.

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

- `apps/web/`: the Nuxt frontend, application shell, route wrappers, public assets, UI-only sessions/conversations modules, and streaming `/api/*` proxy.
- `apps/api/`: the server-only Nuxt application, API handlers, session services, agent runs, and input queues. Local modules register the original API routes.
- `packages/shared/`: framework-independent conversation/session contracts, presentation helpers, Markdown options, and keyboard shortcuts. Both apps import explicit `@pi-simple-web/shared/*` exports; this package has no Pi SDK dependency.
- `tests/`: existing behavior tests, running directly with Node.
- `scripts/`: production bundle smoke tests run exclusively in CI.

Frontend modules register components, composables, and styles and use `#sessions`/`#conversations` aliases for cross-module UI imports. Their `runtime/app/` structure and Tailwind source scanning are preserved. Backend modules contain only `runtime/server/` code. No frontend code imports backend services.

Page routes remain `/`, `/new`, and `/sessions/:id`. API routes remain `GET /api/sessions`, `GET /api/sessions/:id`, and `POST /api/conversations`.
