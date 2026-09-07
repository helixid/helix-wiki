---
id: overview
title: Examples
sidebar_label: Overview
sidebar_position: 1
description: Four Docker demos you run with one command, plus verifier scripts you run against a local API.
---

# Examples

There are two kinds of example, and they have very different setup costs.

- **[Full demos](#full-demos-docker)** — Docker, one command, self-contained. Start here.
- **[Verifier scripts](#verifier-scripts-local-api)** — short scripts against a local API, for reading the verification path in code.

Everything lives in [`examples/`](https://github.com/helixid/helixid/tree/main/examples) in the [`helixid`](https://github.com/helixid/helixid) repository.

## Full demos (Docker)

Each demo is self-contained. You need **this repo and Docker** — no second checkout, no pre-built sibling packages, no registry credentials.

```bash
git clone https://github.com/helixid/helixid.git
cd helixid/examples/<demo>
cp .env.example .env     # set LLM_API_KEY if the demo needs one
docker compose up --build
```

| Demo | Language | What it proves | LLM key |
| --- | --- | --- | --- |
| [`e2e-consent-demo`](./consent-demo.md) | TypeScript | Two independent service providers issue their own grants; a second booking with the same SP reuses the standing grant instead of re-prompting | optional |
| `e2e-consent-demo-py` | Python | The same flow through `helixid-sdk-py` | optional |
| [`e2e-travel-concierge`](./travel-concierge.md) | TypeScript | An LLM agent enrolls, gets a real credential, and an MCP tool refuses to run until the presentation verifies | **required** |
| `e2e-travel-concierge-py` | Python | The same flow through `helixid-sdk-py` | **required** |

New here? Run **[the consent demo](./consent-demo.md)** — it needs no API key and shows the whole identity → consent → verification → action → audit story end to end.

### How the demos are wired

Every demo builds `helix-api` from the repository's own root `Dockerfile`, so you run the code you just cloned, and builds its demo services from its `docker/` directory.

The **Console is the exception** — it is *pulled* from Docker Hub as `helixid/console` rather than built. It lives in [its own repo](https://github.com/helixid/helix-console) and publishes a multi-arch image, so running a demo never requires cloning it. Each demo's `docker/console.Dockerfile` is two lines: `FROM helixid/console:latest` plus its own nginx server block, which same-origin-proxies `/v1` to `helix-api` because the demo API ships without CORS.

SDK packages resolve as ordinary dependencies during the image build — `@helixid/sdk-js`, `@helixid/mcp` and `@helixid/widget` as git dependencies on the public `helixid/helix-sdk-js` repo, and `helixid-sdk-py` from the public `helixid/helix-sdk-py` repo. Nothing is vendored from a sibling directory.

### Where each demo listens

:::warning[Run one demo at a time]
The two TypeScript demos both publish `3000` and `8080`, so they collide with each other. The Python ports are offset, so a Python demo *can* run alongside its TypeScript twin.
:::

| | `e2e-consent-demo` | `e2e-consent-demo-py` | `e2e-travel-concierge` | `e2e-travel-concierge-py` |
| --- | --- | --- | --- | --- |
| **Main UI** | **4100** (chat) | **4200** (chat) | **8090** (chat) | **8091** (chat) |
| **Console** | **8080** | **8081** | **8080** | **8082** |
| HelixID API | 3000 | 3001 | 3000 | 3002 |
| Airline SP | 4101 | 4201 | — | — |
| Hotel SP | 4102 | 4202 | — | — |
| MCP server | — | — | 7100 | 7101 |

### Signing in

Every sign-in across the demos uses a fixed demo credential:

| Where | Sign in with |
| --- | --- |
| Travel Planner / Concierge chat | `traveler` / `demo123` |
| Service Provider consent page (Helix Air, Helix Stay) | `ada` / `demo123` |
| HelixID Console | `admin` / `admin` |

### When a demo doesn't behave

**"Gemini is temporarily unavailable" or rate-limited.** Nothing is wrong with your setup — the free Google AI Studio tier returns `503 UNAVAILABLE` under load and rate-limits quickly. The **consent demos fall back to a scripted planner** and keep working; the chat header switches to `Scripted planner`. The **travel-concierge demos have no fallback** and surface the error until the provider recovers. Set `LLM_PROVIDER=anthropic` or `openai` in `.env` for a steadier run.

**A booking is refused with `VC_EXPIRED`.** The demo credential has a limited lifetime, and setup skips re-enrolment when the persona already exists — so a stack you started days ago keeps presenting a stale credential. Reset it:

```bash
docker compose down -v && docker compose up --build
```

`down -v` is the right reset any time a demo's state looks wrong; all demo state lives in those volumes.

**The consent popup never returns.** The service provider opens its consent page in a popup and hands the signed grant back to the page that opened it, so the demo needs popups allowed for `localhost`, and the chat tab left open.

**The build fails partway through an install**, with a socket or TLS error. The SDK packages install as git dependencies, which run nested installs and pull a lot over the network; a flaky connection fails the build. Re-run `docker compose up --build` — it resumes from cached layers.

## Verifier scripts (local API)

These run against an API you start yourself, rather than in Docker.

```bash
git clone https://github.com/helixid/helixid.git
cd helixid
nvm use            # Node 24.15.0, pinned in .nvmrc
pnpm install
```

Configure `.env` — the SQLite path needs no external infrastructure — then start the server:

```bash
set -a; source .env; set +a
pnpm dev
```

:::tip[If the server won't start]
A first run can fail with `SyntaxError: The requested module '@prisma/client' does not provide an export named 'PrismaClient'`. Generate the Prisma client and start again:

```bash
pnpm db:generate
pnpm dev
```
:::

With the server running, in another terminal with the same environment exported:

```bash
pnpm example:verify-vp
pnpm example:verify-vp:sdk
pnpm example:verify-vp:session-bridge
pnpm example:scope-check
pnpm example:self-verify
pnpm example:revocation-check
```

These mint fresh credentials and sign fresh VPs automatically — no fixture file needed. What each one does: [Verifier Scripts](./local-verification.md).

### Verifier fast-path patterns

Two ways to handle repeat calls after one verification. See [Hybrid 3-Layer Design](../architecture/hybrid-layers.md) for when to choose which.

```bash
# Path A — verifier-issued JWT session
pnpm example:verify-vp:session-bridge

# Path B — VP-result caching, no JWT
pnpm example:verifier:vp-cache
```

In both paths the verifier owns the policy and infrastructure decisions: scope checks, the replay/cache store, TTLs, headers, and secrets.

### Framework middleware

`examples/framework-middleware` exercises the real LangChain and MCP adapters against the live API — a real agent DID created during onboarding, an encrypted wallet, VPs signed locally and verified through the API.

Set `HELIX_ADMIN_API_KEY` in `.env`, start the server, then:

```bash
pnpm example:middleware:setup
pnpm example:middleware:langchain
pnpm example:middleware:mcp
```

The setup script writes `examples/framework-middleware/agent/wallet.enc`, which that package ignores. The scripts log DIDs, VC ids, scopes, and verification results, but never private keys or wallet contents.

## Running the Console on its own

The demos bring their own Console. To run it against your own API instead, clone [`helix-console`](https://github.com/helixid/helix-console) — see [Operator Console](../self-hosting/console.md).
