---
id: offline-verification
title: What "Offline Verification" Actually Means
sidebar_label: What "Offline Verification" Means
sidebar_position: 8
description: The precise claim — no synchronous call to the issuer to authorize this request — and the network hops that do happen.
---

# What "Offline Verification" Actually Means

HelixID does **not** claim that verification works offline.

The claim is narrower, and stronger for being narrow:

> **No synchronous call to the issuer asking it to vouch for this specific request.**

No token introspection. No authorization endpoint. Nothing on the issuer's side that has to be awake and reasoning about this call. That is the real contrast with routing every request through a token-minting bridge.

## Why the loose version is a liability

"Offline" and "no network" are trivially falsifiable — verification does make HTTP requests. An engineer who runs the demo with a packet capture finds them, and at that point every other claim is suspect.

The precise version survives being checked. That is the entire reason to prefer it:

| Loose claim | Precise claim |
| --- | --- |
| "Verification is offline / no network hop" | "No synchronous call to the issuer to authorize this request" |
| "Verified in-process by the SDK" | "Verified by a HelixID API the service chooses, which reads the issuer's published documents" |
| "Works fully offline" | "Static-document reads, all cacheable; everything else computed from the presentation" |
| "No issuer availability required" | "Needs the issuer's public key and revocation bitstring — static documents that cache or sit on a CDN — never a live authorization call" |
| "Revocation works offline" | "Revocation is a static bitstring read, not a per-credential call to the issuer" |

:::warning[Standing rule]
Any documentation, launch copy, deck, or demo script that says "offline" without the "no call to the issuer's authorization logic" qualifier is wrong and should be corrected on sight.
:::

## Who talks to whom

There are three parties on a call, and it is worth being exact about which of them is on the network path.

| Hop | When | What it is |
| --- | --- | --- |
| Agent → its own HelixID server | Before the call | The agent asks for a signed presentation. Keys are in custody, so signing is an API call. |
| Service → the HelixID API it verifies with | On the call | `verifyVP()` and the MCP middleware send the presentation to `POST /v1/vp/verify`. The current SDKs have no in-process verification path. |
| That verifying API → the issuer's published documents | On a cache miss | Static reads: DID documents and status lists. |

The service chooses which HelixID API verifies for it — typically one it runs itself. That API is the service's own infrastructure, not the agent's issuer. When an agent from another organization shows up, the organization that issued its credentials is never asked "should this request go through?" It only has to keep two kinds of static document published.

So the accurate summary is: **verification is one call to your own verifier, plus cacheable reads of the issuer's public documents — and no call to the issuer's authorization logic.**

## The static reads (`did:web`)

All of these are static, cacheable documents. None is a question about your request.

| Read | What it fetches | Nature |
| --- | --- | --- |
| **DID resolution** | The DID document of each signer: the presenting agent, the issuer of each credential, each agent along a delegation chain, and the service that issued a grant | Public keys. The same document every time until a key rotates. On one HelixID deployment these all live under one domain (`/.well-known/did.json`, `/agents/<slug>/did.json`, `/services/<slug>/did.json`). |
| **Revocation** | The status list — read one bit per credential | One bitstring covers every credential that issuer has signed. A shared static file, not a per-credential lookup. |

Everything else — signatures, expiry, the delegation chain, the consent rules, scope intersection — is computed from data already inside the presentation.

When the verifying API is also the issuer (a single organization verifying its own agents), it reads its own DID documents and status lists from its own store.

## Anchoring removes even those

- **`did:key`** carries the public key inside the identifier itself. There is nothing to fetch.
- **`did:hedera`** reads the DID document from a public Hedera mirror node, so the issuer's own domain is never contacted.

This is the strongest form of the claim, and it is a second argument for the optional Hedera anchor beyond tamper-evident audit.

## The shipped cache defaults

These are the defaults in the code, not targets:

| Fact | Reality |
| --- | --- |
| `did:web` DID cache TTL | **5 minutes**, in-process, automatic |
| `did:hedera` DID cache TTL | **15 minutes**, in-process, automatic |
| Status list served by a HelixID server | Marked cacheable for **5 minutes** |
| `did:hedera` availability | Optional package `@helixid/did-hedera`, loaded when installed |

The configurable server-side cache settings are in [Performance & Caching](../architecture/performance-and-caching.md).

:::note[Don't quote numbers the code doesn't ship]
Longer cache TTLs have been discussed. They are not what ships. Changing them is a code change, not a documentation change — do not publish them until the defaults actually say so.
:::

## Why this matters

The comparison that matters is not "network vs. no network." It is **static reads that cache** vs. **an authorization call that by design cannot cache**.

A token introspection endpoint must be asked fresh every time — being asked fresh is its entire purpose — and it must be asked of the party that issued the token. Across organizations that means the caller's identity provider is on the hot path of your service, and for a delegation chain, one such call per hop. A DID document and a status list are the same bytes for every verifier and every request, so they cache and sit on a CDN, and a chain of any length is checked from the presentation itself.

See [Comparisons](../comparisons/why-not-just-use.md) for the OAuth contrast.

## Verifying this yourself

The honest way to check any of the above is a packet capture on the verifying API while it verifies a presentation from an agent issued on a *different* `did:web` domain. You should see reads of that domain's DID documents and status list on a cold cache, and no request to any authorization or token endpoint on that domain at any point.
