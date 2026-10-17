# Barbabot API deployment

The API replaces the old `pi-simple-web` frontend process on port 4001. No frontend runs on this host after migration.

- Artifact run: https://github.com/Barbapapazes/pi-simple-web/actions/runs/39077407165
- Source commit: `c5ca410ed9fed62a7f17c994de6528187d8068b9`
- GitHub artifact: `pi-simple-web-linux-arm64`
- API archive inside it: `pi-simple-api-linux-arm64.tar.gz`
- Runtime directory: `/home/esteban/prod/pi-simple-web-runtime`
- API release directory: `releases/39077407165`
- PM2 process: `pi-simple-api`, one fork, Node.js 24
- Origin: `http://127.0.0.1:4001`
- Intended Cloudflare Tunnel hostname: `barbabot-api.soubiran.dev`

Configure the Cloudflare Tunnel separately to route the API hostname to that origin, protect it with access control, and remove the old `barbabot.soubiran.dev` route. The application itself has no authentication. Keep the origin bound to loopback and allow streaming without proxy buffering. CORS is not authentication.

The API retains the deployment user's existing Pi settings, credentials, and sessions. When a new frontend is deployed, set `NUXT_ALLOWED_ORIGINS` to its exact HTTPS origin in the PM2 environment and restart the process with the updated configuration. Without that setting, the API retains its localhost-only CORS defaults.

## Install the pinned API bundle

Run as `esteban`; do not build or install dependencies on the host:

```sh
ROOT=/home/esteban/prod/pi-simple-web-runtime
RUN=39077407165
mkdir -p "$ROOT/downloads/$RUN" "$ROOT/releases/$RUN"
gh run download "$RUN" --repo Barbapapazes/pi-simple-web \
  --name pi-simple-web-linux-arm64 --dir "$ROOT/downloads/$RUN"
tar -xzf "$ROOT/downloads/$RUN/pi-simple-api-linux-arm64.tar.gz" \
  -C "$ROOT/releases/$RUN"
```

Before the initial migration, copy the existing `ecosystem.config.cjs` to `ecosystem.frontend.config.cjs` for rollback. Copy this directory's `ecosystem.config.cjs` into the runtime directory. Stop and delete the old `pi-simple-web` PM2 entry, then atomically switch the `current` symlink to `releases/39077407165`. Start the API with:

```sh
pm2 start "$ROOT/ecosystem.config.cjs" --only pi-simple-api
pm2 save
```

Restarts interrupt active API conversations. For subsequent deployments, extract into a new release directory before stopping the process and switching `current`; never overwrite a live release.

## Rollback to the previous frontend

The previous release is `releases/38627086417`. Stop and delete `pi-simple-api`, switch `current` back to that directory, restore `ecosystem.frontend.config.cjs` as `ecosystem.config.cjs`, start that configuration, and run `pm2 save`. Restore the old tunnel hostname separately if needed. Retain previous releases and the saved frontend configuration until rollback is no longer needed.
