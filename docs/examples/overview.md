---
id: overview
title: Examples
sidebar_label: Overview
sidebar_position: 1
description: Every runnable HelixID example — two Docker demos, live framework middleware, and standalone verifier scripts.
---

# Examples

Everything here is in the [`examples/`](https://github.com/helixid/helixid/tree/main/examples) directory of the code repository and runs locally.

| Example | Needs | Shows |
| --- | --- | --- |
| [Demo A — Consent](./consent-demo.md) | Docker | User consent across two independent service providers, and the full audit trail |
| [Demo B — Travel Concierge](./travel-concierge.md) | Docker + LLM key | A real LLM agent calling a protected MCP tool, plus revocation and delegation |
| [Delegation chain](./delegation-chain.md) | Node | One agent sub-delegating a reduced credential to another |
| [Local verification scripts](./local-verification.md) | Node + running API | VP verification, scope checks, self-verification, revocation, session bridge |
| [Framework middleware](#framework-middleware) | Node + running API | The real LangChain and MCP adapters, unmocked |

New here? Start with [Demo A](./consent-demo.md). It needs no API key and shows the whole identity → consent → verification → action → audit story end to end.

## Standalone verifier scripts

Start the API first:

```bash
set -a; source .env; set +a
pnpm --filter @helixid/api start
```

Then run any of:

```bash
pnpm example:verify-vp
pnpm example:verify-vp:sdk
pnpm example:verify-vp:session-bridge
pnpm example:scope-check
pnpm example:self-verify
pnpm example:revocation-check
```

These mint fresh credentials and sign fresh VPs automatically — no fixture file needed. Details in [Local Verification](./local-verification.md).

## Verifier fast-path patterns

Both supported patterns have a runnable cycle. See [Hybrid 3-Layer Design](../architecture/hybrid-layers.md) for when to choose which.

### Path A — verifier-issued JWT session

```bash
JWT_SECRET=replace-with-a-strong-secret \
pnpm --filter @helixid/api exec tsx ../examples/verifier-session-cycle.ts
```

Verify a VP once → issue a verifier-owned JWT → subsequent calls verify the JWT locally until TTL expiry.

### Path B — VP-result caching (no JWT)

```bash
pnpm --filter @helixid/api exec tsx ../examples/verifier-vp-cache-cycle.ts
```

Verify a VP once → cache the result by `vpId` with a TTL → subsequent calls with the same `vpId` are cache hits.

In both paths the verifier owns the policy and infrastructure decisions: scope checks, the replay/cache store, TTLs, headers, and secrets.

## Framework middleware

`examples/framework-middleware` demonstrates the real LangChain and MCP adapters **without mocking the Helix client**. It uses the live HelixID API, creates a real agent DID during onboarding, stores an encrypted wallet, requests real VP templates, signs VPs locally, and verifies them through the API.

Configure `.env` for the local API flow first:

```bash
HELIX_ADMIN_API_KEY=...
```

Then:

```bash
pnpm install
set -a; source .env; set +a
pnpm --filter @helixid/api dev
```

In another terminal with the same environment exported:

```bash
pnpm example:middleware:setup
pnpm example:middleware:langchain
pnpm example:middleware:mcp
```

The setup script writes `examples/framework-middleware/agent/wallet.enc`, which is ignored by that example package. The scripts log DIDs, VC ids, scopes, and verification results, but never print private keys or wallet contents.
