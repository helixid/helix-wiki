---
id: project-structure
title: Project Structure
sidebar_label: Project Structure
sidebar_position: 4
description: The four HelixID repositories, what each contains, and which packages are published today.
---

# Project Structure

HelixID is split across **four code repositories** in the [`helixid`](https://github.com/orgs/helixid/repositories) organization, plus this documentation site. They are designed to be cloned as siblings under one parent directory.

```
helixid/
├── helix-server/      Fastify API — the backend everything else talks to
├── helix-sdk-js/      JS/TS monorepo — SDK, CLI, MCP server + middleware, LangChain, widget
├── helix-sdk-py/      Python SDK — mirrors the JS surface, no CLI of its own
└── helix-console/     React admin UI — talks to helix-server over HTTP
```

## The org at a glance

| Repository | What it is | Language | Depends on |
| --- | --- | --- | --- |
| [`helix-server`](https://github.com/helixid/helix-server) | The issuer API — enrollment, VC lifecycle, status lists, `did:web` hosting, session bridge | TypeScript / Fastify | A database; optionally Redis |
| [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js) | Everything a JS/TS agent or verifier installs | TypeScript | Nothing, to build and verify locally |
| [`helix-sdk-py`](https://github.com/helixid/helix-sdk-py) | The Python counterpart, for AI/ML stacks | Python | Nothing, beyond its own extras |
| [`helix-console`](https://github.com/helixid/helix-console) | Operator web UI — agents, enrollment, audit trail | React / Vite | A running `helix-server` |
| [`helix-wiki`](https://github.com/helixid/helix-wiki) | This documentation site | Docusaurus | Nothing |

**`helix-server` is the one thing that must be running** for anything to work end to end. The console and both SDKs reach it over its HTTP API; nothing reaches into anything else's internals.

:::note[`helixid/helixid` and where the server is heading]
[`helixid/helixid`](https://github.com/helixid/helixid) is the monorepo these repositories were split out of. It remains the organization's front door for cross-cutting work — [issues](https://github.com/helixid/helixid/issues), [discussions](https://github.com/helixid/helixid/discussions), and decision records that span components all live there.

<span className="helix-badge helix-badge--progress">In progress</span> **The API is being consolidated back into `helixid/helixid`**, which will become the server repository and keep the flagship name. Until that lands, [`helix-server`](https://github.com/helixid/helix-server) is where the API code lives and is actively developed — clone that one, and expect the URL to change.
:::

## `helix-server`

The trust anchor for a deployment. It owns issuance policy and credential lifecycle, and never sees an agent's private key.

:::caution[This repository is moving]
<span className="helix-badge helix-badge--progress">In progress</span> The API is being folded into [`helixid/helixid`](https://github.com/helixid/helixid), which becomes the server repository. The layout below stays the same — only the repository URL changes. Use `helix-server` today.
:::

```
helix-server/
├── src/            route handlers → services → repositories
├── prisma/         schema.prisma + migrations
├── docs/           architecture decisions, proposals
├── tests/, e2e/    unit and end-to-end tests
├── examples/       runnable verifier scripts
├── fixtures/       shared test vectors
└── scripts/        setup and helper scripts
```

**Dependencies**

| Dependency | Required? | Notes |
| --- | --- | --- |
| Database | Yes — one of two | Postgres, or SQLite as a fast local path that self-initializes its schema with no migration step |
| Redis | No | Only when a Redis cache adapter is configured explicitly; the in-process L1 cache is the default |
| `@helixid/did-hedera` | Pulled at install | Resolved even in `did:key` mode |

Setup and the full environment variable list are in [Installation & Modes](./installation-and-modes.md) and [Environment & Configuration](../self-hosting/configuration.md).

## `helix-sdk-js`

A pnpm workspace managed with Turborepo. Every published npm package lives here.

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

Each package carries its own README, its own test suite, and a `files` allowlist in `package.json` controlling what actually publishes.

**Dependencies:** none to build and verify presentations locally. The Hedera path needs `@helixid/did-hedera` and Hedera operator credentials — it spends real money, so install it only where Hedera support is actually needed.

### `mcp-server` vs `mcp-middleware`

These are easy to confuse and do different jobs:

- **`@helixid/mcp-server`** is a **standalone server**. It exposes the same platform-operator workflows as the CLI — DID, wallet, status-list and VC lifecycle — as MCP tools instead of shell commands. Reach for it when an agent should perform operator actions.
- **`@helixid/mcp-middleware`** is a **library for your own MCP server or client**. It verifies inbound presentations and attaches outbound ones for agent-to-tool calls. It is not a server. This is what [MCP Integration](../integrations/mcp.md) documents.

The CLI is the single canonical implementation of operator workflows and is deliberately not duplicated per SDK language — which is why `helix-sdk-py` ships no CLI of its own.

## `helix-sdk-py`

The Python counterpart to `helix-sdk-js`, for AI/ML stacks. Distribution name `helixid-sdk-py`.

```
helix-sdk-py/
├── src/
│   ├── helix_sdk/               core SDK
│   ├── helix_langchain/         LangChain integration
│   ├── helix_crewai/            CrewAI integration
│   └── helix_mcp_middleware/    MCP auth middleware
├── examples/       demo scripts — these need a running helix-server
├── tests/
└── fixtures/       golden vectors, shared with helix-sdk-js
```

**Dependencies:** none for the package itself beyond its own extras. The example scripts need a running `helix-server`.

The shared `fixtures/` directory is what keeps the two SDKs honest: both verify against the same golden vectors, so a presentation signed in Python must verify through the same path as one signed in TypeScript. Divergent crypto behaviour between the two would be a security bug, not a compatibility inconvenience.

## `helix-console`

The operator view — agents, enrollment, verifier services, and the audit trail, without hitting the API by hand.

```
helix-console/
├── src/
│   ├── pages/, components/, hooks/    feature UI
│   ├── auth/, theme/                  login gate, dark/light mode
│   └── api/                           the one seam wrapping HelixClient
├── docker/         nginx config + container-runtime env injection
├── public/, brand-src/
└── tests/          mirrors src/
```

**Dependencies:** a running `helix-server`, and nothing else.

All API access goes through a single `api/` module wrapping `HelixClient`. The console holds no credential logic of its own — it is a view over the server's state.

## Packages

### Published to npm today

| Package | Version | What it is |
| --- | --- | --- |
| [`@helixid/sdk-js`](../sdk/sdk-js.md) | 0.1.7 | The main SDK — wallet, `VPBuilder`, `verifyVP`, `delegate`, `HelixClient` |
| [`@helixid/core`](../sdk/core.md) | 0.1.5 | Cryptographic primitives |
| [`@helixid/mcp`](../sdk/mcp.md) | 0.1.2 | MCP client helper and server middleware |
| [`@helixid/langchain`](../sdk/langchain.md) | 0.1.1 | LangChain / LangGraph middleware |
| [`@helixid/cli`](../sdk/cli.md) | 0.1.1 | Operator CLI (`helix`) |
| [`@helixid/did-hedera`](../sdk/did-hedera.md) | 0.1.2 | Optional Hedera DID resolver |

### In the repositories, not yet published

<span className="helix-badge helix-badge--progress">In progress</span>

| Package | Replaces / adds |
| --- | --- |
| `@helixid/mcp-middleware` | Takes over the middleware half of `@helixid/mcp` |
| `@helixid/mcp-server` | New — operator workflows as MCP tools |
| [`@helixid/widget`](../sdk/widget.md) | New — the consent widget, source-only today |
| `helixid-sdk-py` | New — the Python SDK, including the CrewAI integration |

:::caution[Install what is published, not what is in the repositories]
The code split has landed, but the package renames have not. `@helixid/core` and `@helixid/mcp` are still the published, installable packages — **keep using them.** `@helixid/mcp-middleware`, `@helixid/mcp-server`, `@helixid/widget` and the Python packages are not on npm or PyPI yet.

`@helixid/core` is a special case: it still installs from npm, but its source now lives only in the monorepo — the primitives it holds have moved inside `@helixid/sdk-js` in `helix-sdk-js`. Expect it to be folded in when the packages are next published.
:::

Progress is tracked on the [Roadmap](../roadmap.md).

## Working across the repositories

Clone them as siblings:

```bash
mkdir helixid && cd helixid
git clone https://github.com/helixid/helix-server.git
git clone https://github.com/helixid/helix-sdk-js.git
git clone https://github.com/helixid/helix-sdk-py.git
git clone https://github.com/helixid/helix-console.git
```

The first of those will become `helixid/helixid` once the [server consolidation](#helix-server) lands.

Start them in dependency order:

1. **`helix-server`** — the SQLite path is the quickest way up.
2. **`helix-console`**, if you need the UI. Its admin key must match the server's.
3. **`helix-sdk-js`** / **`helix-sdk-py`**, pointed at the same API base URL and admin key.

Toolchain versions are pinned per repository — `.nvmrc` for the Node repos, and a pinned interpreter for `helix-sdk-py`. Use them rather than whatever is on your path; these are cryptographic codebases and version drift is not worth debugging.

## Which repository does my change belong in?

| You are changing | Repository |
| --- | --- |
| Issuance, revocation, status lists, the HTTP API | `helix-server` — moving to `helixid/helixid` |
| The wallet, VP building, local verification, delegation | `helix-sdk-js` |
| The CLI, or either MCP package | `helix-sdk-js` |
| A framework adapter for a JS/TS stack | `helix-sdk-js` |
| Anything Python — SDK, LangChain, CrewAI, MCP middleware | `helix-sdk-py` |
| The operator UI | `helix-console` |
| These docs | [`helix-wiki`](https://github.com/helixid/helix-wiki) |
| Something cross-cutting, or you're not sure | [`helixid/helixid`](https://github.com/helixid/helixid/issues) |

One rule holds across all of them: **the SDK owns the cryptography.** Adapters, middleware, and examples must never hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics. Two code paths that are meant to agree and don't is a security bug. See [Coding Standards](../contributing/coding-standards.md).
