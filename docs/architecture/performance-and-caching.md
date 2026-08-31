---
id: performance-and-caching
title: Performance & Caching
sidebar_label: Performance & Caching
sidebar_position: 3
description: Where the latency actually is, the shipped cache defaults, and why the DLT write path never touches verification.
---

# Performance & Caching

> "DLT is slow" is the first objection. Here's the data.

The DLT latency penalty exists only on the **write path** — DID anchoring and credential issuance. The **verification hot path**, which is what matters for real-time agent interactions, never touches the ledger.

## Numbers

| Operation | HelixID (cached) | JWT/OAuth | Raw Ed25519 |
| --- | --- | --- | --- |
| Credential verification | ~1-6 ms | 1-5 ms | ~0.1 ms |
| DID resolution | ~0.01 ms (cache hit) | N/A | N/A |
| Revocation check | ~0.01 ms (cached) | 50-200 ms (introspection) | Not supported |
| Full verification (warm) | ~1-6 ms | 1-5 ms | ~0.1 ms |

"Warm" means the DID document and status list are already cached. Cold, each is a single static-document fetch.

The row that matters is **revocation**. A token introspection call costs 50–200 ms and **cannot be cached** — being asked fresh every time is its entire purpose. A status list is one shared static document, so it caches, sits on a CDN, and costs ~0.01 ms on a hit. Nothing in HelixID's path asks the issuer to authorize the request. See [What "Offline Verification" Actually Means](../concepts/offline-verification.md).

**Context:** A single LLM inference call takes 500 ms–5 s. HelixID verification at ~5 ms is noise in that budget. You get the same verification speed as JWT, backed by cryptographic trust that JWT can never provide.

## Where HelixID actually wins on latency

Not on a single internal call — there, a cached OAuth token is roughly as fast, and HelixID adds complexity for no latency benefit.

The win is **multi-hop delegation**. Each hop is a local signature verification (~1 ms) rather than an issuer callback (500 ms–2 s). A five-hop chain lands around ~55 ms against 400–800 ms+ for per-hop OAuth callbacks. Position accordingly: use OAuth for internal APIs where it is perfect; add HelixID for cross-org APIs and delegation chains. See [Comparisons](../comparisons/why-not-just-use.md).

## Caching architecture

### DID documents

Cached in-process **automatically** — no configuration needed.

| Method | TTL |
| --- | --- |
| `did:web` | 5 minutes |
| `did:hedera` | 15 minutes |
| `did:key` | Not applicable — the key is in the identifier |

`DID_CACHE_L1_TTL_SECONDS` (default `300`) governs the API-side cache.

The TTL is a security parameter as much as a performance one — it bounds how long a verifier can keep using a rotated key.

### Status lists

**Fetched per verification by default.** `fetchStatusList` is a plain fetch; there is no built-in verifier-side cache.

The bitstring is a static document shared by every credential from that issuer, so it caches well — pass a `statusListResolver` to `verifyVP()` to serve it from your own cache, CDN, or local storage. `helix-api` already does this for the list it hosts.

```typescript
const result = await verifyVP(incomingVP, {
  expectedTargetService: 'orders-service',
  statusListResolver: myCachedResolver,
})
```

`STATUS_LIST_CACHE_L1_TTL_SECONDS` (default `60`) governs the API-side serve cache, which applies only when a cache adapter is configured.

:::caution[This TTL is a revocation-latency dial]
Over-aggressive caching leads to use-after-revocation — a revoked agent keeps working until the cache expires. Choose the TTL from how quickly revocation must take effect, and treat it as part of your threat model rather than as a throughput knob.
:::

### Session token bridge

For high-frequency scenarios (1000+ RPS), verify the VC once (~5 ms) and issue an ephemeral JWT for subsequent calls (~0.1 ms). See [Hybrid 3-Layer Design](./hybrid-layers.md).

The session TTL is the same trade-off in a different place: a longer session means fewer verifications and a longer window in which a revoked credential still gets service. `JWT_SESSION_TTL_SECONDS` defaults to `600`.

## Current cache adapters

| Adapter | Status |
| --- | --- |
| `memory` — L1 in-process | Shipped, and the default |
| Redis / L2 shared cache | <span className="helix-badge helix-badge--planned">Planned</span> — parked for a future release, not required for current runs |

```bash
HELIX_CACHE_ADAPTER=memory
CACHE_ENABLED=true
DID_CACHE_L1_TTL_SECONDS=300
STATUS_LIST_CACHE_L1_TTL_SECONDS=60
```

Only the L1 TTLs currently matter. See [Environment & Configuration](../self-hosting/configuration.md) and the [Roadmap](../roadmap.md).

## TTLs worth setting deliberately

| Variable | Default | What it bounds |
| --- | --- | --- |
| `ENROLLMENT_TOKEN_TTL_SECONDS` | 900 | How long a one-time bootstrap token stays usable |
| `CHALLENGE_TTL_SECONDS` | 300 | Onboarding/user-challenge nonce validity |
| `VP_TTL_SECONDS` | 300 | How long a presentation is replayable before expiry |
| `JWT_SESSION_TTL_SECONDS` | 600 | Session-token lifetime after one verification |
| `DID_CACHE_L1_TTL_SECONDS` | 300 | Staleness window for a rotated key |
| `STATUS_LIST_CACHE_L1_TTL_SECONDS` | 60 | Staleness window for a revocation |
