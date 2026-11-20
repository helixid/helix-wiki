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

:::caution[The examples pin older package versions]
The examples have not yet moved to the packages the [SDK reference](../sdk/sdk-js.md) describes. On `main` they pin:

| Where | Pins |
| --- | --- |
| The server (`@helixid/api`, repo root) | `@helixid/core` `^2.0.1` |
| Every TypeScript example and script | `@helixid/sdk-js` `^0.4.0` |
| `e2e-travel-concierge` | `@helixid/mcp-middleware` `^0.1.4`, installed under the alias `@helixid/mcp` |
| `e2e-consent-demo` | `@helixid/widget` `^0.1.0` |
| `framework-middleware` | `@helixid/langchain` `^0.2.2`, `@helixid/mcp-middleware` `^0.1.4` |

These predate `@helixid/sdk-js` 0.6.0 and `@helixid/core` 3.0.0. Server custody is already in place — agents hold no keys, and signing and delegation are API calls — but three things in the example code are the older shape:

- The presentation travels as a `_helixVP` field inside the tool input. Current packages carry it in a header or in MCP `_meta["x-helix-vp"]`.
- `framework-middleware` uses `HelixIDMiddleware` from `@helixid/langchain`, which has since been removed from that package in favour of `HelixIDToolWrapper`.
- The consent demo's service providers sign grants with their own keys through `issueGrant()`. In the current model the service is registered with HelixID and its backend calls `issueServiceDelegationGrant()`; see [The Two-Issuer Model](../concepts/two-issuer-model.md).

Read the examples for the flow, and the SDK reference for the current API.
:::

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
| [`e2e-travel-concierge`](./travel-concierge.md) | TypeScript | An LLM agent is onboarded, gets a real credential, and an MCP tool refuses to run until the presentation verifies | **required** |
| `e2e-travel-concierge-py` | Python | The same flow through `helixid-sdk-py` | **required** |

New here? Run **[the consent demo](./consent-demo.md)** — it needs no API key and shows the whole identity → consent → verification → action → audit story end to end.

### How the demos are wired

Every demo builds `helix-api` from the repository's own root `Dockerfile`, so you run the code you just cloned, and builds its demo services from its `docker/` directory.

The **Console is the exception** — it is *pulled* from Docker Hub as `helixid/console` rather than built. It lives in [its own repo](https://github.com/helixid/helix-console) and publishes a multi-arch image, so running a demo never requires cloning it. Each demo's `docker/console.Dockerfile` is two lines: `FROM helixid/console:latest` plus its own nginx server block, which same-origin-proxies `/v1` to `helix-api` because the demo API ships without CORS.

SDK packages resolve as ordinary dependencies during the image build — `@helixid/sdk-js`, `@helixid/mcp-middleware` and `@helixid/widget` from npm, and `helixid-sdk-py` from PyPI. Nothing is vendored from a sibling directory.

:::caution[The Python demos install an unpinned SDK]
Both Python demos install `helixid-sdk-py>=0.1.1` with no upper bound, so a fresh build pulls the current 2.x release, while the demo code was written against the pre-2.0 API:

- `e2e-consent-demo-py` imports `issue_grant` and `IssuerKeyMaterial` from `helix_sdk.grant`. That module was removed in `helixid-sdk-py` 2.0.0, so the service providers fail on import.
- `e2e-travel-concierge-py` passes the presentation as `_helixVP` in the tool arguments. From 2.0.0 the MCP middleware reads it only from headers or `_meta["x-helix-vp"]`, so the gate refuses every call as missing a presentation.

This is from reading the source, not from a run. Until the demos are updated, use the TypeScript demos, which pin their SDK versions.
:::

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

**The build fails partway through an install**, with a socket or TLS error. The image build downloads the SDK packages and their dependencies from npm or PyPI, and a flaky connection fails it. Re-run `docker compose up --build` — it resumes from cached layers.

## Verifier scripts (local API)

These run against an API you start yourself, rather than in Docker.

```bash
git clone https://github.com/helixid/helixid.git
cd helixid
nvm use            # Node 24.15.0, pinned in .nvmrc
pnpm install
```

Configure `.env` from `.env.example` — the SQLite path needs no external infrastructure — and set `HELIX_ADMIN_API_KEY`. The scripts need it as well as the server: each one onboards a fresh agent and asks the API to sign a presentation for it, and that signing route is admin-key gated. Then start the server:

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

No fixture file is needed. Each script requests an enrollment token, onboards an agent with `client.onboardAgent()`, and has the API sign a fresh presentation with `client.signVP()` — there is no wallet and nothing is signed locally. What each one does, and two that currently fail: [Verifier Scripts](./local-verification.md).

`examples/delegation-demo.ts` has no `pnpm example:*` script; run it with `pnpm exec tsx examples/delegation-demo.ts`. See [Delegation Chain](./delegation-chain.md).

### Verifier fast-path patterns

Two ways to handle repeat calls after one verification. See [Hybrid 3-Layer Design](../architecture/hybrid-layers.md) for when to choose which.

```bash
# Path A — session JWT after one verification
pnpm example:verify-vp:session-bridge

# Path B — VP-result caching, no JWT
pnpm example:verifier:vp-cache
```

In both paths the verifier owns the policy and infrastructure decisions: scope checks, the replay/cache store, TTLs, headers, and secrets. Path B does not run as written today — see [Verifier Scripts](./local-verification.md#known-issues).

### Framework middleware

`examples/framework-middleware` exercises the real LangChain and MCP adapters against the live API, with no mocked client. Setup creates a real agent DID through `POST /v1/onboard`; the scripts then have the API sign each presentation on that agent's behalf and verify it through the API. There is no wallet and no local signing.

Set `HELIX_ADMIN_API_KEY` in `.env`, start the server, then:

```bash
pnpm example:middleware:setup
pnpm example:middleware:langchain
pnpm example:middleware:mcp
```

The setup script writes `examples/framework-middleware/agent/agent.json`, which holds only the agent's DID and credential id — no key material — and is ignored by Git. The scripts log DIDs, VC ids, scopes, and verification results.

| Script | What it shows |
| --- | --- |
| `example:middleware:setup` | Creates a one-use enrollment token, onboards the agent, records its DID and credential id |
| `example:middleware:langchain` | `HelixIDMiddleware` injects `_helixVP` into the tool input and the VP is verified through the API; then `HelixIDToolWrapper` wraps a small structured tool |
| `example:middleware:mcp` | `attachHelixVP` attaches a VP to a tool call, `helixidMCPMiddleware` allows a `read:orders` call and refuses one that needs `write:inventory` |

The admin key is not setup-only here. Signing a presentation is `POST /v1/agents/:did/vp`, which is admin-key gated in the open-source server, so anything running this middleware holds that key. As noted at the top of this page, these scripts use the older `@helixid/langchain` 0.2 and `@helixid/mcp-middleware` 0.1 APIs.

## Running the Console on its own

The demos bring their own Console. To run it against your own API instead, run the `helixid/console` image or clone [`helix-console`](https://github.com/helixid/helix-console) — see [Operator Console](../self-hosting/console.md).
