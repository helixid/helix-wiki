---
id: performance-and-caching
title: Performance & Caching
sidebar_label: Performance & Caching
sidebar_position: 3
description: Where the latency actually is, what is cached and for how long, and why the DLT write path never touches verification.
---

# Performance & Caching

> "DLT is slow" is the first objection. Here is where the time actually goes.

Any ledger latency exists only on the **write path** — anchoring a DID. The **verification path**, which is what matters for real-time agent interactions, never writes to a ledger, and with `did:key` or `did:web` never reads one either.

## What a verification costs

With the current SDKs, `verifyVP()` is an HTTP call to a HelixID API (`POST /v1/vp/verify`) that the verifier chooses and trusts. There is no in-process verification path in the SDK. So the cost of one verification is one round trip to that API, plus whatever the API has to fetch that it does not already have cached.

| Step | Where it runs | Network hop? | Cached? |
| --- | --- | --- | --- |
| Verifier calls `POST /v1/vp/verify` | Verifier → HelixID API | Yes, always | No. One call per verification, unless you use a [session token](#session-token-bridge). |
| Resolve the holder's and each issuer's DID | Inside the API | `did:key`: none. `did:web`: one HTTPS GET. `did:hedera`: one mirror-node GET. | Yes, in process: 5 minutes for `did:web`, 15 minutes for `did:hedera`. |
| Check signatures on the VP, each credential, and each delegation link | Inside the API | No. CPU only. | Not needed. |
| Check revocation against a status list this API hosts | Inside the API | No. Read from the API's own store. | Yes: the status-list cache below. |
| Check revocation against a status list hosted elsewhere | Inside the API | One HTTPS GET per credential that points at it. | No. Fetched on every verification. |
| Write the `VP_VERIFIED` / `VP_REJECTED` audit event | Inside the API | Database write. | No. |

So a warm verification of credentials issued by the same instance is one round trip from the verifier, signature checks, and a database write. A cold one adds a document fetch per uncached DID.

This page does not publish millisecond figures. The numbers depend on where the verifier sits relative to the API, on the storage backend, and on how many credentials and delegation links the presentation carries. Measure in your own deployment.

### What is never on the path

Nothing in verification asks the *issuer* to vouch for this specific request. The issuer signed the credential in advance; the verifier's API checks that signature and reads a status list. Compare a token-introspection design, where every check is a call to the party that issued the token, and that call cannot be cached because being asked fresh is its entire purpose. A status list is one shared static document covering every credential from that issuer, so it caches and can sit behind a CDN. See [what verification does and does not depend on](../concepts/offline-verification.md).

**Context:** an LLM inference call typically takes from hundreds of milliseconds to several seconds. One HTTP round trip for verification is small against that budget.

## Where HelixID helps on latency, and where it does not

Not on a single internal call. A cached OAuth token is checked in process, and a HelixID verification is a network call. For internal APIs inside one trust domain, OAuth is the simpler and faster choice.

The case for HelixID is **delegation chains and cross-organization calls**. A delegated credential embeds its whole chain, so the verifier checks every hop in the one verify call, without asking any delegating agent or issuer to approve the request. The number of round trips from the verifier stays at one however long the chain is; what grows is signature checks and, on a cold cache, DID lookups. See [Comparisons](../comparisons/why-not-just-use.md).

## Caching architecture

There are three separate caches. They have different owners and different knobs.

### 1. The verifier's DID resolver cache

Used inside `verifyVP`. In process memory only, fixed TTLs, no configuration.

| Method | TTL |
| --- | --- |
| `did:web` | 5 minutes |
| `did:hedera` | 15 minutes |
| `did:key` | Not cached — the key is in the identifier |

Deactivating a DID through the API evicts it from this cache on the instance that handled the request.

The TTL is a security parameter as much as a performance one — it bounds how long a verifier can keep using a rotated or deactivated key.

### 2. The API's DID and status-list caches

Used by the API when it serves DID records (`GET /v1/dids/:did`) and the status list it hosts (`GET /v1/status-list/:listId`, and its own revocation checks during verification). These are two-layer caches:

| Layer | What it is | When it is used |
| --- | --- | --- |
| **L1** | A map in the API process's memory. | Always, unless `CACHE_ENABLED=false`. |
| **L2** | Redis, shared between API instances. | Only when `HELIX_CACHE_ADAPTER=redis`, `CACHE_L2_ENABLED=true`, and `REDIS_URL` is set. |

A read checks L1, then L2; an L2 hit is copied back into L1. A write goes to both. An invalidation deletes from both.

| Variable | Default | Bounds | What it bounds |
| --- | --- | --- | --- |
| `DID_CACHE_L1_TTL_SECONDS` | `300` | 1–3600 | In-process staleness of a DID record. |
| `DID_CACHE_L2_TTL_SECONDS` | `900` | 1–86400 | Redis staleness of a DID record. |
| `STATUS_LIST_CACHE_L1_TTL_SECONDS` | `60` | 1–3600 | In-process staleness of the hosted status list. |
| `STATUS_LIST_CACHE_L2_TTL_SECONDS` | `300` | 1–86400 | Redis staleness of the hosted status list. |

Revoking a credential deletes the status-list entry from both layers, and changing or deactivating a DID deletes its entry from both layers. That eviction reaches the instance that handled the request and the shared Redis layer. **Other API instances keep their own L1 copy until its TTL runs out.** With more than one instance, a revocation can therefore take up to `STATUS_LIST_CACHE_L1_TTL_SECONDS` to be seen everywhere, with or without Redis.

:::caution[This TTL is a revocation-latency dial]
Over-aggressive caching leads to use-after-revocation — a revoked agent keeps working until the cache expires. Choose the L1 TTL from how quickly revocation must take effect across all your instances, and treat it as part of your threat model rather than as a throughput knob.
:::

### 3. HTTP caching by whoever fetches from the API

The API sets `Cache-Control` on the public documents it serves, so other verifiers, proxies, and CDNs may hold them:

| Document | `max-age` |
| --- | --- |
| `/.well-known/did.json`, `/agents/:slug/did.json`, `/services/:slug/did.json` | 1 hour |
| `GET /v1/status-list/:listId` | 5 minutes |
| `GET /v1/sessions/public-key` | 1 hour |

These are fixed in the route code. A party that honours them can see a revocation up to five minutes late and a changed DID document up to an hour late, independently of the TTLs above.

Status lists hosted by *another* party are not cached by the API at all: it fetches them on each verification. That keeps revocation fresh for externally hosted lists and costs one request each time.

## Session token bridge

For high-frequency calls from the same agent, verify the presentation once with `session: true` and receive a short-lived EdDSA session token. Its public key is served at `GET /v1/sessions/public-key`, so later requests carrying the token can be checked without another call to `POST /v1/vp/verify`. See [Hybrid 3-Layer Design](./hybrid-layers.md).

The session TTL is the same trade-off in a different place: a longer session means fewer verifications and a longer window in which a revoked credential still gets service. `JWT_SESSION_TTL_SECONDS` defaults to `600`.

The signing key is generated when the API starts. A restart invalidates outstanding tokens, and each API instance has its own key.

## Cache adapters

| Adapter | Status |
| --- | --- |
| `memory` — L1 in-process | Shipped, and the default |
| `redis` — L1 plus shared L2 | Shipped. Needs `REDIS_URL`. |

```bash
HELIX_CACHE_ADAPTER=redis
REDIS_URL=redis://localhost:6379
CACHE_ENABLED=true
CACHE_L2_ENABLED=true
DID_CACHE_L1_TTL_SECONDS=300
DID_CACHE_L2_TTL_SECONDS=900
STATUS_LIST_CACHE_L1_TTL_SECONDS=60
STATUS_LIST_CACHE_L2_TTL_SECONDS=300
```

See [Environment & Configuration](../self-hosting/configuration.md#cache).

## TTLs worth setting deliberately

| Variable | Default | What it bounds |
| --- | --- | --- |
| `JWT_SESSION_TTL_SECONDS` | 600 | Session-token lifetime after one verification |
| `DID_CACHE_L1_TTL_SECONDS` | 300 | Staleness window for a changed DID record, per instance |
| `DID_CACHE_L2_TTL_SECONDS` | 900 | The same, in Redis |
| `STATUS_LIST_CACHE_L1_TTL_SECONDS` | 60 | Staleness window for a revocation, per instance |
| `STATUS_LIST_CACHE_L2_TTL_SECONDS` | 300 | The same, in Redis |

Some lifetimes are fixed in code in `@helixid/core` 3.0.0 and are not configurable:

| Lifetime | Value |
| --- | --- |
| A signed presentation | 5 minutes from signing. It is replayable to its one target service until then; the API does not track consumed `vpId`s. |
| A challenge nonce | 5 minutes |
| An enrollment token | Set per token with `expiry` (whole days) on `POST /v1/enrollment-tokens`; no expiry if omitted |

`VP_TTL_SECONDS`, `CHALLENGE_TTL_SECONDS`, and `ENROLLMENT_TOKEN_TTL_SECONDS` are still accepted by the config schema but are not read. See [Environment & Configuration](../self-hosting/configuration.md#tokens-and-ttls).
