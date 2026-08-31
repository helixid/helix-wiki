---
id: core
title: "@helixid/core"
sidebar_label: "@helixid/core"
sidebar_position: 2
description: The cryptographic primitives layer beneath the SDK and API — DID resolution, Ed25519, VP verification.
---

# `@helixid/core`

**Cryptographic primitives for AI agent identity** — DID resolution, Ed25519 signing and verification, VP verification, canonical JSON, credential schemas, and the delegation and self-signed primitives.

```bash
npm install @helixid/core
```

## When to use it directly

Most applications should not. `@helixid/sdk-js` and `@helixid/api` both depend on `helix-core`, and the SDK exposes what an agent or verifier normally needs.

Reach for `@helixid/core` when you are building something the SDK does not model — a custom resolver, an alternative wallet backend, or a verifier in an unusual runtime.

:::warning[Never re-implement what core owns]
Adapters and integrations must not hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics. Divergent crypto behaviour between two paths that are supposed to agree is a security bug, not a style problem. This is enforced in review — see [Coding Standards](../contributing/coding-standards.md).
:::

## What lives here

| Area | Responsibility |
| --- | --- |
| DID resolution | Resolving `did:key`, `did:web`, and (via the optional plugin) `did:hedera`, with in-process caching |
| Ed25519 | Key generation, signing, and signature verification |
| VP verification | Signature, expiry, target service, revocation, and delegation-chain checks |
| Canonical JSON | Recursively key-sorted serialization, the basis of the proof format |
| Schemas | Credential and presentation shapes |
| Delegation | Child-VC construction and chain validation primitives |
| Self-signed | The development-only self-issuance path |

## Cache TTLs

The DID resolver's TTLs are constants in this package, applied automatically with no configuration:

| Constant | Value |
| --- | --- |
| `DID_WEB_TTL_MS` | 5 minutes |
| `DID_HEDERA_TTL_MS` | 15 minutes |

The VP verifier's `fetchStatusList` is a plain fetch per verification — there is no default status-list cache. Callers inject a `statusListResolver`. See [Performance & Caching](../architecture/performance-and-caching.md).

## Hedera loading

`did:hedera` support is loaded dynamically. If [`@helixid/did-hedera`](./did-hedera.md) is installed, `helix-core` picks it up; if it is not, `did:key` and `did:web` continue to work with no ledger dependency at all. The core never requires a DLT.

## Cryptographic dependencies

Only `@noble/curves` and `@noble/hashes` are permitted for cryptographic operations — audited, maintained, no native dependencies, and tree-shakeable, which keeps the SDK browser-compatible. See [Design Decisions](../architecture/design-decisions.md).
