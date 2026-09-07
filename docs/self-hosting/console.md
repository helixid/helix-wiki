---
id: console
title: Operator Console
sidebar_label: Operator Console
sidebar_position: 3
description: Run the HelixID Console against your own API — browse agents, enroll new ones, and read the audit trail.
---

# Operator Console

The Console is the operator view over a running HelixID server — browse agents, enroll new ones, manage verifier services, and read the audit trail without hitting the API by hand. It lives in [`helix-console`](https://github.com/helixid/helix-console).

It has **no backend of its own.** Everything it shows comes from a running server over HTTP, through a single `api/` module wrapping `HelixClient`. It holds no credential logic.

:::tip[The demos already include it]
Every [example demo](../examples/overview.md) brings up its own Console, pulled from Docker Hub as `helixid/console`. You only need this page if you want a Console against **your own** API.
:::

## Prerequisites

- **Node 20.19+ or 22.12+** — Vite 7's own minimum. An older Node in that range still runs `pnpm dev` but prints a version warning.
- **pnpm** — `corepack enable` if you don't have it.
- **A running server and its admin API key.** See [Installation & Modes](../get-started/installation-and-modes.md); the SQLite + `did:key` path needs no Docker and no Postgres.

## Local development

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

Vite serves on `http://localhost:5173`, or the next free port. Sign in with `admin` / `admin`.

:::warning[Leave `VITE_API_BASE_URL` empty]
This looks like an omission and isn't. The server ships **no CORS handling**, so a direct browser-to-API fetch from Vite's dev origin would be blocked.

Leaving it empty makes the SDK issue *relative* `/v1` requests, which Vite's own dev-server proxy forwards to the API — same-origin as far as the browser is concerned. The proxy target is in `vite.config.ts` and defaults to `http://localhost:3000`; edit that file if your API runs elsewhere.

Only fill in `VITE_ADMIN_API_KEY`.
:::

## In Docker

The Console publishes a multi-arch image to Docker Hub, so a container deployment needs no build:

```dockerfile
FROM helixid/console:latest
COPY console-nginx.conf /etc/nginx/conf.d/default.conf
```

That is exactly what each demo's `docker/console.Dockerfile` does. The nginx server block it layers on reverse-proxies `/v1` and `/health` to that stack's API — again because the API ships without CORS.

The consequence is worth understanding if you copy the pattern: in the demos, `API_BASE_URL` is set to the **Console's own origin** (`http://localhost:8080`), not the API's port. Every call lands same-origin and nginx forwards it.

## What it can do

The Console is an operator tool, and its reach is bounded by the admin API key you give it:

- Browse enrolled agents, their DIDs, scopes, and credential status
- Mint enrollment tokens and watch an agent onboard
- Revoke a credential and see the status-list bit flip
- Read the [audit trail](../concepts/trust-stack.md#layer-4--audit) — issuance, consent, presentation, verification, authorization, action, result, refusals included

:::danger[The admin key is not a login]
`VITE_ADMIN_API_KEY` is a **server admin credential**, and in a Vite build it ends up in the browser bundle. The `admin` / `admin` sign-in is a demo gate, not authentication.

This is fine for local development and the demos. For anything real, put the Console behind your own authentication and do not ship a build carrying a production admin key. See the [Security Model](../security/security-model.md#key-custody).
:::
