---
id: core
title: The core API layer
sidebar_label: "@helixid/core"
sidebar_position: 2
description: The server-side package that holds HelixID's API implementation — and why you don't install it in an application.
---

# The core API layer

`@helixid/core` is the package that holds HelixID's **API implementation** — routes, services, repositories, storage adapters, caching, audit, and optional Hedera support. It lives in [`helix-core`](https://github.com/helixid/helix-core).

:::danger[Do not install this in an application]
This is a **server-side dependency**. The self-hosted server ([`helixid`](https://github.com/helixid/helixid)) consumes it as a git dependency; you do not add it to an agent, a verifier, or an integration.

If you are building against HelixID, you want [`@helixid/sdk-js`](./sdk-js.md) or the Python SDK. Everything an agent or verifier needs is there.
:::

:::caution[The `@helixid/core` on npm is retired]
There is an older `@helixid/core` published to npm at **0.1.5**. It predates the repository split and is **retired** — it was withdrawn once its only second consumer stopped needing it locally.

The current package reuses the name for a different purpose and is consumed from source, not from npm. Do not add the npm package to new code, and remove it if you have it. The reasoning is recorded in [`proposal-retire-core-package.md`](https://github.com/helixid/helixid/blob/main/docs/proposal-retire-core-package.md).
:::

## What lives here

| Area | Responsibility |
| --- | --- |
| `routes/` | The HTTP surface — every endpoint in the [API reference](./http-api.md) |
| `services/` | Business logic — issuance, verification, delegation, revocation |
| `repositories/` | Persistence, behind an interface |
| `storage/` | Storage adapters |
| `cache/` | DID document and status-list caching |
| `audit/` | The [audit log contract](../security/security-model.md#audit-log-contract) |
| `middleware/` | Request-level concerns |
| `hedera/` | Optional `did:hedera` support |

## Why it is a separate package

Keeping the API implementation in its own package means the layer that makes trust decisions has **one home** rather than copies that drift apart. The server repository stays thin — a runnable shell that composes this package — and the logic itself is versioned and tested in one place.

See [Project Structure](../get-started/project-structure.md#how-helixid-and-helix-core-fit-together) for how the two fit together.

## Where the client-side crypto lives

The primitives an agent or verifier needs — DID resolution and caching, Ed25519 signing and verification, VP verification, canonical JSON — are in [`@helixid/sdk-js`](./sdk-js.md), which depends directly on `@noble/ed25519` and `@noble/hashes`.

:::warning[Never re-implement what the SDK owns]
Adapters, middleware, and examples must not hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics. Divergent crypto behaviour between two paths that are supposed to agree is a security bug, not a style problem. This is enforced in review — see [Coding Standards](../contributing/coding-standards.md).
:::

## Cache TTLs

The DID resolver's TTLs are applied automatically with no configuration:

| DID method | TTL |
| --- | --- |
| `did:web` | 5 minutes |
| `did:hedera` | 15 minutes |

The status list has **no default cache** — callers inject a `statusListResolver`. See [Performance & Caching](../architecture/performance-and-caching.md).

## Hedera

`did:hedera` support is loaded dynamically. If [`@helixid/did-hedera`](./did-hedera.md) is present it is picked up; if not, `did:key` and `did:web` work with no ledger dependency at all. The core never requires a DLT.
