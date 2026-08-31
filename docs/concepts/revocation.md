---
id: revocation
title: Revocation
sidebar_label: Revocation
sidebar_position: 7
description: How Bitstring Status List revocation works, why it is a shared static document, and how to manage cache staleness.
---

# Revocation

Revoking an API key means rotating it everywhere it was ever used. Revoking a HelixID credential means flipping **one bit** in a document the issuer already publishes. Nothing else has to change, and the agent's other credentials keep working.

HelixID uses a **Bitstring Status List** ([W3C StatusList2021](https://www.w3.org/TR/vc-bitstring-status-list/)): a gzip-compressed, base64url-encoded bitstring in which each credential the issuer has ever signed owns one index. `0` means active; `1` means revoked.

## Why a bitstring and not a revocation list

The obvious design — publish a list of revoked credential IDs — was considered and rejected for two reasons:

- **It leaks.** A list of revoked IDs tells anyone who reads it exactly which credentials were revoked and how many. A bitstring index reveals nothing on its own.
- **It doesn't cache.** Checking one ID against a registry is a per-credential network call to the issuer. A bitstring is one shared static file covering every credential from that issuer, so it caches well, sits happily on a CDN, and does not tell the issuer which credential a verifier was curious about.

That second property is what keeps revocation off the [issuer's authorization path](./offline-verification.md). The verifier reads a document; it never asks the issuer a question about this request.

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

Service providers host their own status lists for the [consent grants they issue](./two-issuer-model.md) — revocation of a grant is SP-owned, and HelixID keeps no index mapping grants to services.

## Cache staleness is the real operational parameter

The gap between flipping a bit and every verifier noticing is bounded by caching, and this is the part worth configuring deliberately.

| Layer | Shipped default |
| --- | --- |
| Verifier-side status-list cache | **None by default.** `fetchStatusList` is a plain fetch per verification; callers inject a `statusListResolver` to cache it |
| Issuer-side serve cache | 60s TTL, and only when a cache adapter is configured |
| `STATUS_LIST_CACHE_L1_TTL_SECONDS` | `60` |

```typescript
const result = await verifyVP(incomingVP, {
  expectedTargetService: 'orders-service',
  statusListResolver: myCachedResolver,   // serve from your cache, CDN, or local storage
})
```

:::caution[Over-aggressive caching causes use-after-revocation]
A long status-list TTL means a revoked agent keeps working until the cache expires. This is a security trade-off, not a performance knob — pick the TTL from how fast you need revocation to take effect, and treat it as part of your threat model. `helix-api` already serves its own hosted list through a resolver.
:::

## What revocation does not cover

- **Expiry is separate.** A credential past `validUntil` is rejected regardless of its status bit. Short-lived credentials reduce how much you have to rely on revocation at all.
- **Revoking the root revokes the branch.** Revoking an issuer-backed root credential invalidates every [delegated child](./delegation.md) derived from it.
- **Grants are revoked by the SP.** HelixID cannot revoke a consent grant on a service provider's behalf.

## Seeing it run

[Use case 3 of the Travel Concierge demo](../examples/travel-concierge.md) revokes a live credential mid-session: the wallet still signs a valid VP, but HelixID rejects it because the status-list bit is now set. There is also a self-contained [`revocation-check`](../examples/local-verification.md) script that onboards a credential, revokes it, verifies the bit flip, and onboards a replacement.
