# Pi Simple Web

Local Pi chat and session browser built with Nuxt, [Nuxt UI](https://ui.nuxt.com/), and [Pinia Colada](https://pinia-colada.esm.dev/).

Start a new chat, continue existing sessions, and watch Pi's text, thinking, and tool results stream live. Browse sessions across workspaces, filter by workspace or search session names/first messages, and inspect transcripts and image attachments. The dashboard uses Nuxt UI, while the conversation rendering follows Pi's terminal: monospace text, full-width prompt bands, bare assistant replies, muted thinking, and state-colored tool panels.

New chats let you choose a workspace: enter an existing absolute directory path on the server, pick a suggestion from previous sessions, or leave it blank to use the server user's home directory (`~`). Pi uses that workspace for tools, project instructions, and resource discovery, with its configured defaults (model, thinking level, credentials, and tools). Existing conversations resume in their recorded workspace. There are no model selectors. Configure Pi normally through its CLI/configuration before chatting.

Requires Node.js 22.18+ (or Node.js 24) and pnpm.

## Development

```bash
pnpm install
pnpm dev
```

## Session storage

The server-side `@earendil-works/pi-coding-agent` SDK discovers sessions under the server user's `~/.pi/agent/sessions/`. Browsing does not require credentials or a running agent. Sending messages requires a configured Pi model and credentials, just like the CLI.

For a custom directory containing `.jsonl` session files directly (such as a Pi `--session-dir` directory):

```bash
NUXT_PI_SESSION_DIR=/absolute/path/to/sessions pnpm dev
```

The API resolves session IDs to paths discovered by the SDK; it never accepts a session file path from the browser. New chats accept a workspace directory path, which the server validates before creating a session. Viewing details uses an in-memory `SessionManager`, so legacy format migrations do not rewrite the source file. Sending a message opens the persistent session through the SDK and saves the continued conversation. New sessions are also persistent and honor the custom session directory.

The transcript shows the stored leaf's branch, including pre-compaction history; alternate branches and live, unpersisted CLI state are not shown. Web chat responses are streamed while running. Avoid continuing the same session in the CLI and web app at the same time; simultaneous independent web runs for a session are rejected. While a web response is active, Enter sends a steering message after the current assistant turn and its tools; Alt+Enter queues a follow-up after Pi finishes its pending work (Ctrl+Q is also available on Windows). Shift+Enter inserts a newline. Pending steering and follow-up messages appear above the composer and disappear when delivered; the follow-up button also works without a keyboard. Additional input uses the same live SDK session and stream. Leaving the chat page or closing the browser connection does not interrupt a response: the agent continues in the background and saves the conversation while the server remains running. Reopen or refresh the session to see persisted progress; live streams are not reattached automatically. Server shutdowns or restarts stop background runs. Messages and thinking render Markdown through Comark, with HTML, custom components, and arbitrary attributes disabled. Tool output and entry data remain literal text. Tool calls and results are paired by call ID, including parallel calls. Reads show a path and optional line range, with their output available on expansion; shell panels show the last five output lines; writes and other tools preview ten lines. Edit results show colored diffs when recorded. Assistant and user prose is never clipped. Thinking and metadata are collapsible. A compact footer shows the workspace and current Git branch, cumulative input/output and cache read/write tokens, the latest request's cache hit rate, recorded USD cost, context usage/model limit, and automatic compaction status. Billing totals include all branches, summaries, tool-reported model usage, and cache warming, matching Pi's terminal footer. Figures update as web-chat messages finish and when the session refreshes. Context is unknown when the model limit is unavailable or until a successful response after compaction/context edits; browsing reflects current model catalogs, settings, and Git state rather than historical CLI state. Streaming follows the latest output only while you are near the bottom; scrolling up pauses following, with a “Jump to latest” button to resume.

**Security:** Pi can execute commands and modify files using the configured tools. Choosing a workspace is not a sandbox or a restriction on file access. Sessions can contain secrets, source code, and command output. This app has no authentication. Development binds to `127.0.0.1`; keep production on loopback too. Do not expose it publicly without adding authentication and access control. Remote hosting cannot read sessions from your laptop unless you supply them to the server.

## Production

```bash
pnpm build
HOST=127.0.0.1 node .output/server/index.mjs
```

## Checks

ESLint uses [`@antfu/eslint-config`](https://github.com/antfu/eslint-config) for TypeScript, Vue, and code style. Run `pnpm lint:fix` to apply automatic fixes.

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## Code organization

Features are encapsulated in two automatically registered Nuxt local modules:

- `modules/sessions/`: session discovery, persisted data, usage/status calculation, queries, browsing filters, sidebar, and previews.
- `modules/conversations/`: conversation views, composer, Markdown/tool rendering, agent runs, streaming, and input queues. It declares a dependency on sessions through `moduleDependencies`.

Each module registers its own components, composables, and API handlers in `index.ts`. Runtime app code lives under `runtime/app/`; server services and handlers live under `runtime/server/`. Use `#sessions` and `#conversations` aliases for explicit cross-module app imports. Server/shared code uses relative `.ts` imports so unit tests can run directly with Node.

`app/` retains the application shell, thin route wrappers, and global styles. `app/assets/css/main.css` explicitly includes `modules/` in Tailwind source scanning so utilities in local-module components are generated. Conversation-specific styles live in `modules/conversations/runtime/app/assets/css/conversation.css`. Neutral conversation data contracts live in `shared/types/conversation.ts`, allowing sessions to describe saved entries without depending on the conversations module. Sessions never imports conversations.

Page routes are `/`, `/new`, and `/sessions/:id`. The sessions module exposes `GET /api/sessions` and `GET /api/sessions/:id`; the conversations module exposes `POST /api/conversations` for starting responses and submitting steering/follow-up input. Pinia stores and Colada query/mutation composables are auto-imported by their Nuxt modules.
