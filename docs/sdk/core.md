---
id: core
title: The core API layer
sidebar_label: "@helixid/core"
sidebar_position: 2
description: The server-side package that holds HelixID's API implementation — and why you don't install it in an application.
---

# The core API layer

`@helixid/core` is the package that holds HelixID's **API implementation** — Fastify route plugins, services, repositories, storage drivers, caching, key custody, audit, and the verification logic itself. It lives in [`helix-core`](https://github.com/helixid/helix-core) and is published on npm. The current version is **3.0.0**.

```bash
npm install @helixid/core
```

:::danger[Do not install this in an application]
This is a **server-side dependency**. You install it to build or run a HelixID API server. You do not add it to an agent, a verifier, or an integration.

If you are building against HelixID, you want [`@helixid/sdk-js`](./sdk-js.md) or the [Python SDK](./sdk-py.md). Everything an agent or verifier needs is there, and it talks to a server built on this package over HTTP.
:::

:::note[Version history]
`@helixid/core` at **0.1.x** was an older, different package from before the repository split; anything still depending on `^0.1.5` is using that retired line. From 1.0.0 the name is the API layer described here. 2.0.0 retired agent self-custody (the server generates and holds agent keys). 3.0.0 removed the prepare/finalize grant flow and added custodial services and server-signed consent grants.

The open-source [`helixid`](https://github.com/helixid/helixid) server still pins `^2.0.1` on `main`. These docs describe 3.0.0.
:::

## What lives here

| Area | Responsibility |
| --- | --- |
| `routes/` | The HTTP surface as Fastify plugins — every endpoint in the [API reference](./http-api.md) |
| `services/` | Business logic — DIDs, issuance, verification, agent onboarding, VP signing, delegation, service enrollment, consent grants, revocation |
| `services/key-custody/` | Generates agent and service keys and keeps them encrypted (AES-256-GCM) |
| `repositories/` | Persistence, behind an interface |
| `storage/` | Storage drivers — SQLite and Postgres |
| `cache/` | DID document and status-list caching: in-process, with an optional Redis second layer |
| `audit/` | The [audit log contract](../security/security-model.md#audit-log-contract) |
| `middleware/` | Error handling and request logging |
| `hedera/` | Optional `did:hedera` support |
| `core/` | Config schema, crypto, credential and presentation schemas, the DID resolver, and `verifyVP` |

## How a server uses it

A server is a composition root: load config, pick storage and cache, construct the services, register the route plugins, listen. The package exports everything needed for that — `loadConfigFromEnv`, the repositories and services, `AesGcmKeyCustody`, `createDidCache` / `createStatusListCache`, `createHederaClient`, `errorHandler`, and the route plugins (`didRoutes`, `didWebRoutes`, `vcRoutes`, `statusListRoutes`, `vpRoutes`, `sessionRoutes`, `agentRoutes`, `serviceProviderRoutes`, `auditLogRoutes`). `src/server.ts` in the repository is a complete working example.

Who may call a route is the one thing that differs between deployments, so the DID and service routes take an `authorize(request, action)` function. Without one they fall back to comparing `x-admin-api-key` with the configured admin key. See [HTTP API](./http-api.md#authentication).

Configuration is covered in [Environment & Configuration](../self-hosting/configuration.md).

## Why it is a separate package

Keeping the API implementation in its own package means the layer that makes trust decisions has **one home** rather than copies that drift apart. The server repository stays thin — a runnable shell that composes this package — and the logic itself is versioned and tested in one place.

See [Project Structure](../get-started/project-structure.md#how-helixid-and-helix-core-fit-together) for how the two fit together.

## Where signing and verification happen

In the current model both are server-side, in this package:

- **Signing.** Agents and services hold no keys. The server signs presentations (`POST /v1/agents/:did/vp`), delegated credentials (`POST /v1/agents/:did/delegate`), and consent grants (`POST /v1/service-delegation-grants`) with keys it keeps in custody.
- **Verification.** `verifyVP` runs here, behind `POST /v1/vp/verify`. The SDK's `verifyVP()` is an HTTP call to that route on a HelixID API the verifier chooses and trusts.

The SDKs carry the client, the VP transport helpers, and scope checks. See [`@helixid/sdk-js`](./sdk-js.md).

:::warning[Never re-implement what the core owns]
Adapters, middleware, and examples must not hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics. Divergent crypto behaviour between two paths that are supposed to agree is a security bug, not a style problem. This is enforced in review — see [Coding Standards](../contributing/coding-standards.md).
:::

## Cache TTLs

Two caches exist, and they are separate.

The **verifier's DID resolver** (used inside `verifyVP`) keeps resolved documents in process memory with fixed TTLs and no configuration:

| DID method | TTL |
| --- | --- |
| `did:web` | 5 minutes |
| `did:hedera` | 15 minutes |
| `did:key` | Not cached — the key is in the identifier |

The **API-side caches** for DID records and the hosted status list are configurable, with an optional Redis second layer. Their TTLs come from `DID_CACHE_L1_TTL_SECONDS`, `DID_CACHE_L2_TTL_SECONDS`, `STATUS_LIST_CACHE_L1_TTL_SECONDS`, and `STATUS_LIST_CACHE_L2_TTL_SECONDS`.

See [Performance & Caching](../architecture/performance-and-caching.md).

## Hedera

`did:hedera` support is loaded dynamically. [`@helixid/did-hedera`](./did-hedera.md) is not a dependency of this package, not even an optional one: install it yourself when you set `DID_METHOD=hedera` or need to resolve `did:hedera` identifiers. Without it, `did:key` and `did:web` work with no ledger dependency at all, and any attempt to create or resolve a `did:hedera` fails with an error naming the missing package. The core never requires a DLT.
