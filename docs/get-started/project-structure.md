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
├── helix-console/    Operator web UI
├── helix-sdk-js/          JS/TS SDK, CLI, MCP, LangChain, widget
├── helix-sdk-py/          Python SDK
└── helix-wiki/            This documentation site
```

## The org at a glance

| Repository | Package | What it is |
| --- | --- | --- |
| [`helixid`](https://github.com/helixid/helixid) | `@helixid/api` | **The server you deploy.** A thin, runnable shell that composes the API implementation |
| [`helix-core`](https://github.com/helixid/helix-core) | `@helixid/core` | **The API implementation.** Routes, services, repositories, storage, cache, audit, Hedera |
| [`helix-console`](https://github.com/helixid/helix-console) | — | React operator UI — agents, enrollment, verifier services, audit trail |
| [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js) | 7 npm packages | Everything a JS/TS agent or verifier installs |
| [`helix-sdk-py`](https://github.com/helixid/helix-sdk-py) | `helixid-sdk-py` | The Python counterpart, for AI/ML stacks |
| [`helix-wiki`](https://github.com/helixid/helix-wiki) | — | This documentation site |

**A running server is the one thing everything else needs.** The console and both SDKs reach it over its HTTP API; nothing reaches into anything else's internals.

## How `helixid` and `helix-core` fit together

This pair is the part worth understanding first, because the names do not tell you which is which.

```
helixid  (@helixid/api)        ← the thing you run
   │
   │  depends on, as a git dependency:
   │     "@helixid/core": "github:helixid/helix-core"
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
└── core/           shared primitives
```

:::note[Why the split exists]
Keeping the API implementation in its own package means the layer that makes trust decisions is a single real dependency rather than a copy that drifts. `helixid` composes it into a server you can run; the logic itself has one home.
:::

:::caution[Don't install `@helixid/core` in an application]
It is a **server-side dependency**, consumed by the server as a git dependency — not something an agent or verifier installs. If you are building an agent, a verifier, or an integration, you want [`@helixid/sdk-js`](../sdk/sdk-js.md) or the Python SDK.

There is an older `@helixid/core` on npm (0.1.5) from before the split. It is **retired** — do not add it to new code. See [The core layer](../sdk/core.md).
:::

## `helixid` — the server you run

```
helixid/
├── src/                       server entrypoint and env loading
├── examples/                  every runnable demo and verifier script
│   ├── e2e-consent-demo/          user consent across two SPs  (JS)
│   ├── e2e-consent-demo-py/       the same demo, Python agent
│   ├── e2e-travel-concierge/      LLM agent + protected MCP tool  (JS)
│   ├── e2e-travel-concierge-py/   the same demo, Python agent
│   ├── framework-middleware/      live LangChain and MCP adapters
│   └── *.ts                       standalone verifier scripts
├── prisma/                    schema and migrations
├── docs/                      architecture decisions and proposals
├── e2e/                       end-to-end tests
├── scripts/                   setup and helper scripts
├── docker-compose.local.yml
└── Dockerfile
```

It is a pnpm workspace: the root is `@helixid/api`, and `examples/*` are workspace packages, which is how the `pnpm example:*` scripts resolve. See [Examples](../examples/overview.md).

**Dependencies**

| Dependency | Required? | Notes |
| --- | --- | --- |
| `@helixid/core` | Yes | Pulled as a git dependency from `helixid/helix-core` |
| `@helixid/sdk-js`, `@helixid/did-hedera`, `@helixid/widget` | Yes | Git dependencies pinned to a specific commit of `helixid/helix-sdk-js` — they are not on npm yet, and each builds during install |
| Database | Yes — one of two | Postgres, or SQLite as a fast local path that self-initializes its schema with no migration step |
| Redis | No | Only when a Redis cache adapter is configured explicitly |
| `@helixid/did-hedera` | Pulled at install | Resolved even in `did:key` mode |

Setup is in [Installation & Modes](./installation-and-modes.md); every variable is in [Environment & Configuration](../self-hosting/configuration.md).

## `helix-sdk-js`

A pnpm workspace managed with Turborepo. Every npm package lives here.

```
helix-sdk-js/
├── helix-sdk-js/      core SDK (@helixid/sdk-js)
├── cli/               the `helix` command-line tool
├── mcp-server/        standalone MCP server for operator workflows
├── mcp-middleware/    VP verification/attachment for other MCP servers
├── langchain/         LangChain / LangGraph integration
├── widget/            browser consent widget
├── did-hedera/        optional Hedera DID method
└── fixtures/          golden vectors, shared with helix-sdk-py
```

| Package | Version | What it is |
| --- | --- | --- |
| [`@helixid/sdk-js`](../sdk/sdk-js.md) | 0.1.7 | Wallet, `VPBuilder`, `verifyVP`, `delegate`, `HelixClient` |
| [`@helixid/cli`](../sdk/cli.md) | 0.1.1 | Operator CLI (`helix`) |
| `@helixid/mcp-server` | 0.1.0 | Operator workflows exposed as MCP tools |
| [`@helixid/mcp-middleware`](../sdk/mcp.md) | 0.1.2 | VP verification for your own MCP server |
| [`@helixid/langchain`](../sdk/langchain.md) | 0.1.1 | LangChain / LangGraph middleware |
| [`@helixid/widget`](../sdk/widget.md) | 0.1.0 | SP-side consent widget |
| [`@helixid/did-hedera`](../sdk/did-hedera.md) | 0.1.2 | Optional Hedera DID resolver |

Each package carries its own README, test suite, and a `files` allowlist controlling what publishes.

**Dependencies:** none to build and verify presentations locally. The Hedera path needs `@helixid/did-hedera` and operator credentials — it spends real money, so install it only where Hedera support is actually needed.

### `mcp-server` vs `mcp-middleware`

Easy to confuse, different jobs:

- **`@helixid/mcp-server`** is a **standalone server**. It exposes the same platform-operator workflows as the CLI — DID, wallet, status-list and VC lifecycle — as MCP tools instead of shell commands.
- **`@helixid/mcp-middleware`** is a **library for your own MCP server or client**. It verifies inbound presentations and attaches outbound ones. This is what [MCP Integration](../integrations/mcp.md) documents.

The CLI is the single canonical implementation of operator workflows and is deliberately not duplicated per language — which is why `helix-sdk-py` ships no CLI.

## `helix-sdk-py`

The Python counterpart, for AI/ML stacks. Distribution name `helixid-sdk-py`.

```
helix-sdk-py/
├── src/
│   ├── helix_sdk/               core SDK
│   ├── helix_langchain/         LangChain integration
│   ├── helix_crewai/            CrewAI integration
│   └── helix_mcp_middleware/    MCP auth middleware
├── examples/       demo scripts — these need a running server
├── tests/
└── fixtures/       golden vectors, shared with helix-sdk-js
```

**Dependencies:** none for the package itself beyond its own extras. The example scripts need a running server.

The shared `fixtures/` directory is what keeps the two SDKs honest: both verify against the same golden vectors, so a presentation signed in Python must verify through the same path as one signed in TypeScript. Divergent crypto behaviour between them would be a security bug, not a compatibility inconvenience.

## `helix-console`

The operator view — agents, enrollment, verifier services, and the audit trail, without hitting the API by hand.

```
helix-console/
├── src/
│   ├── pages/, components/, hooks/    feature UI
│   ├── auth/, theme/                  login gate, dark/light mode
│   ├── api/                           the one seam wrapping HelixClient
│   └── runtimeConfig.ts               container-runtime configuration
├── docker/         nginx config + runtime env injection
├── tests/          mirrors src/
├── public/, brand-src/
├── vite.config.ts
└── Dockerfile
```

**Dependencies:** a running server, and nothing else.

All API access goes through a single `api/` module wrapping `HelixClient`. The console holds no credential logic of its own — it is a view over the server's state.

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
2. **`helix-console`**, if you need the UI. Its admin key must match the server's.
3. **`helix-sdk-js`** / **`helix-sdk-py`**, pointed at the same API base URL and admin key.

You only need `helix-core` cloned if you are changing the API implementation itself — running the server pulls it automatically.

Toolchain versions are pinned per repository — `.nvmrc` for the Node repos, and a pinned interpreter for `helix-sdk-py`. Use them rather than whatever is on your path; these are cryptographic codebases and version drift is not worth debugging.

## Which repository does my change belong in?

Each repository tracks its own issues and pull requests — file against the one you are changing.

| You are changing | Repository |
| --- | --- |
| Routes, services, issuance, verification, revocation, storage | [`helix-core`](https://github.com/helixid/helix-core/issues) |
| Server packaging, deployment, Prisma schema, Docker | [`helixid`](https://github.com/helixid/helixid/issues) |
| The wallet, VP building, local verification, delegation | [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js/issues) |
| The CLI, or either MCP package | [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js/issues) |
| Anything Python — SDK, LangChain, CrewAI, MCP middleware | [`helix-sdk-py`](https://github.com/helixid/helix-sdk-py/issues) |
| The operator UI | [`helix-console`](https://github.com/helixid/helix-console/issues) |
| These docs | [`helix-wiki`](https://github.com/helixid/helix-wiki/issues) |

If you are unsure whether a bug is in the server shell or the API implementation, file it against `helix-core` — that is where the logic lives.

One rule holds across all of them: **the SDK owns the cryptography.** Adapters, middleware, and examples must never hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics. Two code paths meant to agree that don't is a security bug. See [Coding Standards](../contributing/coding-standards.md).
