---
id: overview
title: Examples
sidebar_label: Overview
sidebar_position: 1
description: Every runnable HelixID example — four end-to-end demos, live framework middleware, and standalone verifier scripts.
---

# Examples

Everything here lives in [`examples/`](https://github.com/helixid/helixid/tree/main/examples) in the [`helixid`](https://github.com/helixid/helixid) server repository, and runs locally.

| Example | Needs | Shows |
| --- | --- | --- |
| [Demo A — Consent](./consent-demo.md) | Docker | User consent across two independent service providers, and the full audit trail |
| [Demo B — Travel Concierge](./travel-concierge.md) | Docker + LLM key | A real LLM agent calling a protected MCP tool, plus revocation and delegation |
| [Delegation chain](./delegation-chain.md) | Node | One agent sub-delegating a reduced credential to another |
| [Verifier scripts](./local-verification.md) | Node + running server | VP verification, scope checks, self-verification, revocation, session bridge |
| [Framework middleware](#framework-middleware) | Node + running server | The real LangChain and MCP adapters, unmocked |

New here? Start with [Demo A](./consent-demo.md). It needs no API key and shows the whole identity → consent → verification → action → audit story end to end.

:::note[Both end-to-end demos ship in two languages]
`e2e-consent-demo` and `e2e-travel-concierge` drive the agent side with the JS SDK. `e2e-consent-demo-py` and `e2e-travel-concierge-py` do the same against the same server using the Python SDK. The walkthroughs describe the JS variants; the Python ones follow the same script and expose the same ports.
:::

## Getting set up

```bash
git clone https://github.com/helixid/helixid.git
cd helixid
pnpm install
```

The repository pins **Node 24.15.0** in `.nvmrc` — run `nvm use` first. It is a pnpm workspace, and `examples/*` are workspace packages, which is how the `pnpm example:*` scripts below resolve.

:::tip[If the server won't start]
A first run can fail with `SyntaxError: The requested module '@prisma/client' does not provide an export named 'PrismaClient'`. Generate the Prisma client and start again:

```bash
pnpm db:generate
pnpm dev
```
:::

`pnpm install` pulls `@helixid/sdk-js`, `@helixid/did-hedera` and `@helixid/widget` as **git dependencies pinned to a specific commit** of [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js) — they are not on npm yet — and builds each during install.

The Docker demos need none of this; they build their own images.

## Standalone verifier scripts

Start the server first, from the repository root:

```bash
set -a; source .env; set +a
pnpm dev
```

Then, in another terminal with the same environment exported:

```bash
pnpm example:verify-vp
pnpm example:verify-vp:sdk
pnpm example:verify-vp:session-bridge
pnpm example:scope-check
pnpm example:self-verify
pnpm example:revocation-check
```

These mint fresh credentials and sign fresh VPs automatically — no fixture file needed. Details in [Verifier Scripts](./local-verification.md).

## Verifier fast-path patterns

Two ways to handle repeat calls after one verification. See [Hybrid 3-Layer Design](../architecture/hybrid-layers.md) for when to choose which.

**Path A — verifier-issued JWT session.** Verify a VP once, receive a short-lived token, reuse it:

```bash
pnpm example:verify-vp:session-bridge
```

**Path B — VP-result caching, no JWT.** Verify once, cache the result by `vpId`, and take cache hits on repeat calls:

```bash
pnpm example:verifier:vp-cache
```

In both paths the verifier owns the policy and infrastructure decisions: scope checks, the replay/cache store, TTLs, headers, and secrets.

## Framework middleware

`examples/framework-middleware` demonstrates the real LangChain and MCP adapters **without mocking the Helix client**. It uses the live API, creates a real agent DID during onboarding, stores an encrypted wallet, signs VPs locally, and verifies them through the API.

Set `HELIX_ADMIN_API_KEY` in `.env`, start the server, then in another terminal:

```bash
pnpm example:middleware:setup
pnpm example:middleware:langchain
pnpm example:middleware:mcp
```

The setup script writes `examples/framework-middleware/agent/wallet.enc`, which that package ignores. The scripts log DIDs, VC ids, scopes, and verification results, but never print private keys or wallet contents.
