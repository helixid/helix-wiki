---
id: project-structure
title: Project Structure
sidebar_label: Project Structure
sidebar_position: 4
description: The public HelixID repositories, what each one contains, and how they depend on each other.
---

# Project Structure

HelixID is developed across **six public repositories** in the [`helixid`](https://github.com/orgs/helixid/repositories) organization.

```
helixid/
├── helixid/               The self-hosted server you run  (@helixid/api)
├── helix-core/            The API implementation it runs  (@helixid/core)
├── helix-console/         Operator web UI  (helixid/console image)
├── helix-sdk-js/          JS/TS SDK, CLI, MCP packages, LangChain, widget
├── helix-sdk-py/          Python SDK  (helixid-sdk-py)
└── helix-wiki/            This documentation site
```

## The org at a glance

| Repository | Package | What it is |
| --- | --- | --- |
| [`helixid`](https://github.com/helixid/helixid) | `@helixid/api` (private, not published) | **The server you deploy.** A thin, runnable shell that composes the API implementation, plus the examples |
| [`helix-core`](https://github.com/helixid/helix-core) | `@helixid/core` on npm | **The API implementation.** Routes, services, repositories, storage, cache, audit, Hedera |
| [`helix-console`](https://github.com/helixid/helix-console) | `helixid/console` on Docker Hub | React operator UI — agents, onboarding, revocation, audit trail |
| [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js) | 7 npm packages | Everything a JS/TS agent or verifier installs |
| [`helix-sdk-py`](https://github.com/helixid/helix-sdk-py) | `helixid-sdk-py` on PyPI | The Python counterpart, for AI/ML stacks |
| [`helix-wiki`](https://github.com/helixid/helix-wiki) | — | This documentation site |

**A running server is the one thing everything else needs.** The console and both SDKs reach it over its HTTP API; nothing reaches into anything else's internals.

## How `helixid` and `helix-core` fit together

This pair is the part worth understanding first, because the names do not tell you which is which.

```
helixid  (@helixid/api)        ← the thing you run
   │
   │  depends on, as a published npm package:
   │     "@helixid/core": "^2.0.1"
   ▼
helix-core  (@helixid/core)    ← where the API actually lives
```

**`helixid`** is deliberately thin — its `src/` holds a server entrypoint and environment loading, and little else. It is the packaging: the runnable, self-hostable server, plus its Prisma schema, tests, and Docker setup.

**`helix-core`** is the substance. Everything that makes a decision lives here:

```
helix-core/src/
├── routes/         HTTP surface — the endpoints in the API reference
├── services/       business logic — issuance, verification, delegation, revocation
├── repositories/   persistence, behind an interface
├── storage/        storage adapters
├── cache/          DID and status-list caching
├── audit/          the audit log contract
├── middleware/     request-level concerns
├── hedera/         optional did:hedera support
└── core/           shared primitives — crypto, schemas, errors, DID resolution,
                    status lists, VP verification, the OpenAPI spec
```

:::note[The server repository lags the published core]
`helixid` on `main` still pins `@helixid/core` `^2.0.1`, while the published package — and the [HTTP API reference](../sdk/http-api.md) — is at 3.0.0. A server built from `helixid` today therefore runs the 2.x API: server custody, API-side signing and delegation are there, but the 3.0.0 changes (services registered with HelixID, `POST /v1/service-delegation-grants`) are not. The [examples](../examples/overview.md) pin correspondingly older SDK versions.
:::

:::note[Why the split exists]
Keeping the API implementation in its own package means the layer that makes trust decisions is a single real dependency rather than a copy that drifts. `helixid` composes it into a server you can run; the logic itself has one home.
:::

:::caution[Don't install `@helixid/core` in an application]
It is the **API layer**: published on npm, but meant to be composed into a server, not installed by an agent or verifier. If you are building an agent, a verifier, or an integration, you want [`@helixid/sdk-js`](../sdk/sdk-js.md) or the Python SDK. See [The core layer](../sdk/core.md).
:::

## `helixid` — the server you run

```
helixid/
├── src/                       server.ts (composition root) and loadEnv.ts
├── examples/                  every runnable demo and verifier script
│   ├── e2e-consent-demo/          user consent across two SPs  (TypeScript)
│   ├── e2e-consent-demo-py/       the same demo in Python
│   ├── e2e-travel-concierge/      LLM agent + protected MCP tool  (TypeScript)
│   ├── e2e-travel-concierge-py/   the same demo in Python
│   ├── e2e-screenshots/           scripts that capture the demo flows
│   ├── framework-middleware/      live LangChain and MCP adapters
│   └── *.ts                       verifier scripts and delegation-demo.ts
├── prisma/                    schema and migrations
├── tests/                     live integration tests (tests/live)
├── e2e/                       end-to-end test package
├── docs/                      design decisions and proposals
├── scripts/                   setup and helper scripts
├── docker-compose.local.yml   API plus Console, no demo apps
└── Dockerfile
```

It is a pnpm workspace: the root is `@helixid/api`, and `examples`, `examples/*` and `e2e` are workspace packages, which is how the `pnpm example:*` scripts resolve. See [Examples](../examples/overview.md).

**Dependencies**

| Dependency | Required? | Notes |
| --- | --- | --- |
| `@helixid/core` | Yes | `^2.0.1`, from npm. The published package is at 3.0.0 — see the note above |
| `fastify`, `@prisma/client`, `pg`, `ioredis` | Yes | `fastify` `^5.12.3`, Prisma `^7.10.0`, `pg` `^8.23.0`, `ioredis` `^5.11.1` |
| `@helixid/sdk-js` | Dev-only | `^0.4.0`, from npm. Used by this repository's examples and tests, not by the server |
| `@helixid/did-hedera` | Dev-only | `^0.1.2`, from npm. `helix-core` looks for it at runtime and carries on without Hedera resolution if it is absent |
| Database | Yes — one of two | Postgres (`HELIX_STORAGE_ADAPTER=postgres`, needs `DATABASE_URL`) or SQLite (`HELIX_STORAGE_ADAPTER=sqlite`), the quick local path |
| Redis | No | Only when `HELIX_CACHE_ADAPTER=redis`; the default cache is in-process memory |

Node `^20.19.0 || >=22.12.0` and pnpm 9 or later; `.nvmrc` pins Node 24.15.0 and `packageManager` pins `pnpm@9.15.2`.

Setup is in [Installation & Modes](./installation-and-modes.md); every variable is in [Environment & Configuration](../self-hosting/configuration.md).

## `helix-sdk-js`

A pnpm workspace managed with Turborepo. Every npm package lives here.

```
helix-sdk-js/
├── helix-sdk-js/      core SDK (@helixid/sdk-js)
├── cli/               the `helix` command-line tool
├── mcp-server/        standalone MCP server for operator workflows
├── mcp-middleware/    auth gate for your own MCP server
│   └── examples/order-management/
├── langchain/         LangChain / LangGraph integration
├── widget/            browser consent widget
├── did-hedera/        optional Hedera DID method
├── fixtures/          golden vectors, shared with helix-sdk-py
└── .changeset/        pending release notes
```

| Package | Version | What it is |
| --- | --- | --- |
| [`@helixid/sdk-js`](../sdk/sdk-js.md) | 0.6.0 | `HelixClient`, `verifyVP`, scope checks, `SessionManager`, VP transport helpers |
| [`@helixid/cli`](../sdk/cli.md) | 0.3.1 | Operator CLI (`helix`) |
| `@helixid/mcp-server` | 0.2.2 | Operator workflows exposed as MCP tools over stdio (`helix-mcp-server`) |
| [`@helixid/mcp-middleware`](../sdk/mcp.md) | 0.4.0 | Auth gate for your own MCP server: HelixID presentations, OAuth bearer tokens, per-tool scopes |
| [`@helixid/langchain`](../sdk/langchain.md) | 0.4.0 | LangChain / LangGraph tool wrapper |
| [`@helixid/widget`](../sdk/widget.md) | 0.3.1 | SP-side consent widget |
| [`@helixid/did-hedera`](../sdk/did-hedera.md) | 0.2.1 | Optional Hedera DID method |

Versions are as of this page's last update; each package's npm page has the current one.

:::note[`@helixid/mcp` is the old name]
`@helixid/mcp` was split into `@helixid/mcp-middleware` and `@helixid/mcp-server`. The old package is still on npm at 0.1.2 and is superseded; install one of the two new ones. Some examples still import `@helixid/mcp`, as an alias for an older `@helixid/mcp-middleware`.
:::

Each package carries its own README, changelog and test suite. `cli`, `langchain`, `mcp-middleware` and `mcp-server` depend on `@helixid/sdk-js` through the workspace.

**Dependencies:** a running HelixID API. Onboarding, signing, delegation and verification are all API calls — `verifyVP()` posts to `POST /v1/vp/verify` on the API the verifier chooses and trusts. The Hedera path additionally needs `@helixid/did-hedera` and operator credentials — it spends real money, so install it only where Hedera support is actually needed.

### `mcp-server` vs `mcp-middleware`

Easy to confuse, different jobs:

- **`@helixid/mcp-server`** is a **standalone server**. It exposes the same platform-operator workflows as the CLI — DID, wallet, status-list and VC lifecycle — as MCP tools instead of shell commands.
- **`@helixid/mcp-middleware`** is a **library for your own MCP server or client**. It gates inbound tool calls on a verified presentation or bearer token, and attaches presentations to outbound calls. This is what [MCP Integration](../integrations/mcp.md) documents.

The CLI is the single canonical implementation of operator workflows and is deliberately not duplicated per language — which is why `helix-sdk-py` ships no CLI.

## `helix-sdk-py`

The Python counterpart, for AI/ML stacks. One distribution, `helixid-sdk-py` on PyPI (2.1.0, Python 3.9+), containing four import packages:

```bash
pip install helixid-sdk-py
pip install "helixid-sdk-py[mcp-middleware]"   # extras: langchain, crewai, mcp-middleware, all
```

```
helix-sdk-py/
├── src/
│   ├── helix_sdk/               core SDK
│   ├── helix_langchain/         LangChain integration
│   ├── helix_crewai/            CrewAI integration
│   └── helix_mcp_middleware/    MCP auth middleware
├── examples/       demo scripts and an MCP order-management sample — these need a running server
├── tests/
├── fixtures/       golden vectors, shared with helix-sdk-js
└── pyproject.toml
```

**Dependencies:** `pynacl`, `cryptography` and `requests`, plus whatever an extra pulls in (the extras need Python 3.10+). Like the JS SDK, it needs a running HelixID API.

The shared `fixtures/` directory is what keeps the two SDKs honest: both are tested against the same golden vectors for canonical JSON, signing and VP building. Divergent crypto behaviour between them would be a security bug, not a compatibility inconvenience.

## `helix-console`

The operator view — agents, onboarding, revocation, and the audit trail, without hitting the API by hand. Published as the `helixid/console` image on Docker Hub.

```
helix-console/
├── src/
│   ├── pages/          Login, Agents, Enroll, Audit
│   ├── components/     agents/, enroll/, layout/
│   ├── auth/, theme/   login gate, dark/light mode
│   ├── api/            client.ts (fetch-based API client) and types.ts
│   └── runtimeConfig.ts    container-runtime configuration
├── docker/         nginx config + runtime env injection
├── tests/          mirrors src/
├── public/
├── vite.config.ts
└── Dockerfile
```

**Dependencies:** a running server, and nothing else.

All API access goes through `src/api/client.ts`, which calls the admin endpoints with `fetch`. It does not import `@helixid/sdk-js`. The console holds no credential logic of its own — it is a view over the server's state. See [Operator Console](../self-hosting/console.md).

## Working across the repositories

Clone what you need as siblings:

```bash
mkdir helixid && cd helixid
git clone https://github.com/helixid/helixid.git
git clone https://github.com/helixid/helix-core.git
git clone https://github.com/helixid/helix-console.git
git clone https://github.com/helixid/helix-sdk-js.git
git clone https://github.com/helixid/helix-sdk-py.git
```

Start in dependency order:

1. **`helixid`** — the server. The SQLite path is the quickest way up.
2. **`helix-console`**, if you need the UI. Its admin key must match the server's. You can run the published image instead of cloning it.
3. **`helix-sdk-js`** / **`helix-sdk-py`**, pointed at the same API base URL and admin key.

You only need `helix-core` cloned if you are changing the API implementation itself — the server installs it from npm.

Toolchain versions are pinned per repository — `.nvmrc` for the Node repos (24.15.0 in `helixid`, 22.21.1 in `helix-core`, `helix-sdk-js` and `helix-console`), and `.python-version` (3.11.11) for `helix-sdk-py`. Use them rather than whatever is on your path; these are cryptographic codebases and version drift is not worth debugging.

## Which repository does my change belong in?

Each repository tracks its own issues and pull requests — file against the one you are changing.

| You are changing | Repository |
| --- | --- |
| Routes, services, issuance, verification, revocation, storage | [`helix-core`](https://github.com/helixid/helix-core/issues) |
| Server packaging, deployment, Docker, the examples | [`helixid`](https://github.com/helixid/helixid/issues) |
| `HelixClient`, VP transport, scope helpers, the consent widget, the LangChain wrapper | [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js/issues) |
| The CLI, or either MCP package | [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js/issues) |
| Anything Python — SDK, LangChain, CrewAI, MCP middleware | [`helix-sdk-py`](https://github.com/helixid/helix-sdk-py/issues) |
| The operator UI | [`helix-console`](https://github.com/helixid/helix-console/issues) |
| These docs | [`helix-wiki`](https://github.com/helixid/helix-wiki/issues) |

If you are unsure whether a bug is in the server shell or the API implementation, file it against `helix-core` — that is where the logic lives.

One rule holds across all of them: **`helix-core` and the SDKs own the cryptography.** Adapters, middleware, and examples must never hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics. Two code paths meant to agree that don't is a security bug. See [Coding Standards](../contributing/coding-standards.md).
