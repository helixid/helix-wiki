---
id: console
title: Operator Console
sidebar_label: Operator Console
sidebar_position: 3
description: Run the HelixID Console against your own API — browse agents, onboard new ones, revoke credentials, and read the audit trail.
---

# Operator Console

The Console is the operator view over a running HelixID server — browse agents, onboard new ones, revoke credentials, and read the audit trail without hitting the API by hand. It lives in [`helix-console`](https://github.com/helixid/helix-console).

It has **no backend of its own.** It is a static React app, and everything it shows comes from a running server over HTTP. All API access goes through one module, `src/api/client.ts`, which calls the admin endpoints with `fetch` and sends the admin key as `x-admin-api-key`. It does not import `@helixid/sdk-js`; its request and response types are defined locally. It holds no credential logic.

:::tip[The demos already include it]
Every [example demo](../examples/overview.md) brings up its own Console, pulled from Docker Hub as `helixid/console`. You only need this page if you want a Console against **your own** API.
:::

## Run the published image

The Console is published to Docker Hub as [`helixid/console`](https://hub.docker.com/r/helixid/console) for `linux/amd64` and `linux/arm64`. You do not need to clone the repository to run it:

```bash
docker pull helixid/console:latest

docker run -p 8080:80 \
  -e API_BASE_URL=http://localhost:3000 \
  -e ADMIN_API_KEY=your-admin-key \
  -e CONSOLE_USERNAME=admin \
  -e CONSOLE_PASSWORD=admin \
  helixid/console:latest
```

Open `http://localhost:8080`.

Every push to `main` publishes `:latest` and a `:<git-sha>` tag. Pin the sha for a reproducible deployment.

### Runtime environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `API_BASE_URL` | yes | — | URL of the HelixID API as the operator's **browser** reaches it |
| `ADMIN_API_KEY` | yes | — | The same value the server has as `HELIX_ADMIN_API_KEY` |
| `CONSOLE_USERNAME` | no | `admin` | Login gate username |
| `CONSOLE_PASSWORD` | no | `admin` | Login gate password |

Nothing is baked in at build time. At container start, `docker/40-env-config.sh` writes these values into `env-config.js`, which `index.html` loads before the app bundle. The container exits at startup if `API_BASE_URL` or `ADMIN_API_KEY` is missing.

:::warning[`API_BASE_URL` is used by the browser, and the API has no CORS handling]
The browser makes the API calls, not the container, so `API_BASE_URL` must never be a Docker-internal hostname. And because the server ships no CORS handling, a browser on the Console's origin cannot call an API on a different origin directly.

The pattern that works is the one the demos use: serve the Console and the API from the same origin. Put a reverse proxy in front that forwards `/v1` and `/health` to the API, and set `API_BASE_URL` to the Console's own origin.
:::

### Same-origin proxy, as the demos do it

Each demo's `docker/console.Dockerfile` is two lines:

```dockerfile
FROM helixid/console:latest
COPY console-nginx.conf /etc/nginx/conf.d/default.conf
```

The nginx server block it layers on serves the app and reverse-proxies `/v1` and `/health` to that stack's API. In the demos, `API_BASE_URL` is therefore set to the **Console's own origin** (`http://localhost:8080`), not the API's port. Every call lands same-origin and nginx forwards it.

To build the image yourself instead, run `docker build -f Dockerfile -t helixid-console .` from the repository root.

## Local development

For working on the Console itself.

- **Node 20.19+ or 22.12+** — Vite 7's own minimum. The repository's `.nvmrc` pins 22.21.1.
- **pnpm** — `corepack enable` if you don't have it.
- **A running server and its admin API key.** See [Installation & Modes](../get-started/installation-and-modes.md).

With the server running on `http://localhost:3000`:

```bash
git clone https://github.com/helixid/helix-console.git
cd helix-console
pnpm install
cp .env.example .env
```

```bash
# .env
VITE_API_BASE_URL=
VITE_ADMIN_API_KEY=dev-admin-key-change-in-production   # must match the server's HELIX_ADMIN_API_KEY
```

```bash
pnpm dev
```

Vite serves on `http://localhost:5173`, or the next free port. Sign in with `admin` / `admin`, or set `VITE_CONSOLE_USERNAME` / `VITE_CONSOLE_PASSWORD`.

:::warning[Leave `VITE_API_BASE_URL` empty]
This looks like an omission and isn't. The server ships **no CORS handling**, so a direct browser-to-API fetch from Vite's dev origin would be blocked.

Leaving it empty makes the Console issue *relative* `/v1` requests, which Vite's own dev-server proxy forwards to the API — same-origin as far as the browser is concerned. The proxy target is in `vite.config.ts` and defaults to `http://localhost:3000`; edit that file if your API runs elsewhere.

Only fill in `VITE_ADMIN_API_KEY`.
:::

Other scripts: `pnpm test` (Vitest with coverage), `pnpm typecheck`, `pnpm build`.

## What it can do

The Console has a login page and three screens. Its reach is bounded by the admin API key you give it.

| Route | Screen | What it does |
| --- | --- | --- |
| `/login` | Login | The access gate. Any other route redirects here until you sign in |
| `/agents` | Agents | The default screen. Lists each agent's latest credential — name, DID, scopes, status, delegation — from `GET /v1/vcs` |
| `/enroll` | Enroll an agent | Onboards an agent in one click |
| `/audit` | Audit & Governance | The most recent 100 audit events from `GET /v1/audit-log`, newest first |

**Agents.** Click a row for the detail panel: the full credential, the credential history for that DID, and a **Revoke** button, which calls `POST /v1/vcs/:vcId/revoke`. The status badge changes only after the API confirms and the detail is fetched again.

**Enroll.** Enter an agent name, at least one requested scope, optional domains, and an optional maximum delegation depth, then click **Onboard now**. The Console mints an enrollment token (`POST /v1/enrollment-tokens`) and immediately redeems it (`POST /v1/onboard`), then shows the new agent's DID with a link to the Agents screen. The token is never displayed, and there is nothing to copy into an agent process or wait for: the server generates and holds the agent's key. The scope field suggests a few common scopes, but scopes are free-text and you can type your own.

**Audit.** Entries that carry a subject DID link to the Agents screen filtered to that DID.

Nothing updates in real time. Each screen has a **Refresh** button. There is no services screen, and no view of a presentation's contents.

:::note[The repository README is behind the code]
At the time of writing, the README in `helix-console` still describes a Services screen, an enrollment token shown on screen with an onboarding poll, and a client that wraps `HelixClient`. None of those are in the source on `main`; this page follows the source.
:::

:::danger[The login is an access gate, not a security boundary]
The `admin` / `admin` sign-in is checked in the browser. The admin key — `ADMIN_API_KEY` at runtime, `VITE_ADMIN_API_KEY` in development — is a **server admin credential**, and it is delivered to every browser that loads the Console whether or not anyone has signed in. The signed-in state is a flag in `sessionStorage`.

Treat the Console's trust boundary as identical to any other client holding that key. This is fine for local development and the demos. For anything real, put the Console behind your own authentication and network controls. See the [Security Model](../security/security-model.md#key-custody).
:::
