---
id: revocation
title: Revocation
sidebar_label: Revocation
sidebar_position: 7
description: How Bitstring Status List revocation works, why it is a shared static document, and how to manage cache staleness.
---

# Revocation

Revoking an API key means rotating it everywhere it was ever used. Revoking a HelixID credential means flipping **one bit** in a document the issuer already publishes. Nothing else has to change, and the agent's other credentials keep working.

HelixID uses a [W3C **Bitstring Status List**](https://www.w3.org/TR/vc-bitstring-status-list/): a gzip-compressed, base64url-encoded bitstring in which each credential the issuer has ever signed owns one index. `0` means active; `1` means revoked.

## Why a bitstring and not a revocation list

The obvious design — publish a list of revoked credential IDs — was considered and rejected for two reasons:

- **It leaks.** A list of revoked IDs tells anyone who reads it exactly which credentials were revoked and how many. A bitstring index reveals nothing on its own.
- **It doesn't cache.** Checking one ID against a registry is a per-credential network call to the issuer. A bitstring is one shared static file covering every credential from that issuer, so it caches well, sits happily on a CDN, and does not tell the issuer which credential a verifier was curious about.

That second property is what keeps revocation off the [issuer's authorization path](./offline-verification.md). Verification reads a document; it never asks the issuer a question about this request.

## Checking a status bit

Verification does this automatically when the VC carries a `credentialStatus`. To do it by hand:

1. Fetch the status list from `vc.credentialStatus.statusListCredential`.
2. Decode `encodedList` — base64url decode, then gzip decompress.
3. Read the bit at `statusListIndex`.
4. `0` → active. `1` → revoked.

## Revoking a credential

Through the API (requires `x-admin-api-key`):

```bash
POST /v1/vcs/:vcId/revoke
```

Through the SDK:

```typescript
await client.revokeVC(vcId)
```

The same call revokes any credential the server holds: an agent's credential, a delegated credential, or a consent grant.

Through the CLI, for an issuer that hosts its own status-list file:

```bash
helix revoke --vc-id <vcId> --status-list ./public/status/1.json --wallet issuer.enc
```

To check current state without verifying a full presentation, `HelixClient.checkVCStatus(vc)` returns `active`, `revoked`, or `expired`.

## Hosting a status list

| Operation | Surface |
| --- | --- |
| Serve the list publicly | `GET /v1/status-list/:listId` — cacheable for 5 minutes |
| Create or replace a list | `POST /v1/status-list` — requires `x-admin-api-key` |
| Create a signed list file | `helix status-list create --length <bits> --output <path> --base-url <url> --wallet <path>` |

`helix did create --method web` creates the issuer's initial status list by default. Pass `--no-status-list` to skip it.

[Consent grants](./two-issuer-model.md) and [delegated credentials](./delegation.md) each get their own index on the server's status list when they are issued, so each can be revoked individually.

## Cache staleness is the real operational parameter

The gap between flipping a bit and every verifier noticing is bounded by caching, and this is the part worth configuring deliberately.

Three caches sit between the bit and a decision:

- **The verifying API's status-list read.** A HelixID server reads the lists it hosts itself from its own store rather than over HTTP, through an in-process cache that defaults to 60 seconds (`STATUS_LIST_CACHE_L1_TTL_SECONDS`). Lists hosted elsewhere are fetched over HTTP.
- **HTTP caching of the list.** `GET /v1/status-list/:listId` is served as cacheable for 5 minutes, so anything between the issuer and a remote verifier — a CDN, a proxy — may hold a copy that long.
- **Whatever the service caches after verifying.** A session JWT or a cached verification result keeps working until it expires, regardless of the status list.

The configurable TTLs are listed in [Performance & Caching](../architecture/performance-and-caching.md).

:::caution[Over-aggressive caching causes use-after-revocation]
A long status-list TTL or a long-lived session token means a revoked agent keeps working until it expires. This is a security trade-off, not a performance knob — pick the lifetime from how fast you need revocation to take effect, and treat it as part of your threat model.
:::

## What revocation does not cover

- **Expiry is separate.** A credential past `validUntil` is rejected regardless of its status bit. Note that `validUntil` is optional — a credential issued without it ends only by revocation.
- **Revoking a parent revokes the branch.** Revoking a credential invalidates every [delegated credential](./delegation.md) derived from it, because the chain no longer verifies.
- **Revoking a grant does not revoke the agent.** The agent's own credential and its grants at other services are untouched.
- **Already-issued sessions.** A short-lived session token minted from an earlier verification runs to its own expiry.

## Seeing it run

[Use case 3 of the Travel Concierge demo](../examples/travel-concierge.md) revokes a live credential mid-session: the agent's next presentation is rejected because the status-list bit is now set. The standalone revocation script is described under [Verifier Scripts](../examples/local-verification.md).
