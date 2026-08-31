---
id: offline-verification
title: What "Offline Verification" Actually Means
sidebar_label: What "Offline Verification" Means
sidebar_position: 8
description: The precise claim — no synchronous call to the issuer to authorize this request — and the two static reads that still happen.
---

# What "Offline Verification" Actually Means

HelixID does **not** claim that verification works offline.

The claim is narrower, and stronger for being narrow:

> **No synchronous call to the issuer asking it to vouch for this specific request.**

No token introspection. No authorization endpoint. Nothing on the issuer's side that has to be awake and reasoning about this call. That is the real contrast with routing every request through a token-minting bridge.

## Why the loose version is a liability

"Offline" and "no network" are trivially falsifiable for `did:web` — a verifier does make HTTP requests. An engineer who runs the demo with a packet capture finds two of them, and at that point every other claim is suspect.

The precise version survives being checked. That is the entire reason to prefer it:

| Loose claim | Precise claim |
| --- | --- |
| "Verification is offline / no network hop" | "No synchronous call to the issuer to authorize this request" |
| "Works fully offline" | "Two static-document reads, both cacheable; everything else computed from the VP" |
| "No issuer availability required" | "Needs the issuer's public key and revocation bitstring — static documents that cache or sit on a CDN — never a live authorization call" |
| "Revocation works offline" | "Revocation is a static bitstring read, not a per-credential call to the issuer" |

:::warning[Standing rule]
Any documentation, launch copy, deck, or demo script that says "offline" without the "no call to the issuer's authorization logic" qualifier is wrong and should be corrected on sight.
:::

## The two reads (`did:web`)

Both are static, cacheable documents. Neither is a question about your request.

| Read | What it fetches | Nature |
| --- | --- | --- |
| **DID resolution** | `GET https://<issuer-domain>/.well-known/did.json` | The public key. The same document every time until the key rotates. |
| **Revocation** | The status list — read one bit | One bitstring covers every credential that issuer has ever signed. A shared static file, not a per-credential lookup. |

Everything else — VP and VC signatures, expiry, the delegation chain, scope intersection — is computed from data already inside the presentation. **Zero network.**

This is step 4 in the [flow diagram](../get-started/introduction.md) — the self-loop on the MCP server, which never leaves the process.

## Anchoring removes even those

On a ledger the issuer drops out entirely:

- **`did:key`** carries the public key inside the identifier itself. There is nothing to fetch.
- **`did:hedera`** reads the DID document from a public Hedera mirror node, so the issuer's own domain is never contacted.

This is the strongest form of the claim, and it is a second argument for the optional Hedera anchor beyond tamper-evident audit.

## The shipped cache defaults

These are the actual defaults in the code, not targets:

| Fact | Reality | Where |
| --- | --- | --- |
| `did:web` DID cache TTL | **5 minutes**, in-process, automatic | `helix-core` DID resolver (`DID_WEB_TTL_MS`) |
| `did:hedera` DID cache TTL | **15 minutes**, in-process, automatic | same resolver (`DID_HEDERA_TTL_MS`) |
| Status-list cache | **None by default.** `fetchStatusList` is a plain fetch per verification; callers inject a `statusListResolver` to cache it. `helix-api` does this for its own hosted list. | `helix-core` VP verifier |
| Issuer-side serve cache | 60s TTL, and only when a cache adapter is configured | `helix-api` VC service |
| `did:hedera` availability | Optional package `@helixid/did-hedera`, dynamically loaded | `helix-core` Hedera loader |

:::note[Don't quote numbers the code doesn't ship]
Longer cache TTLs have been discussed (on the order of an hour for DIDs, minutes for revocation). They are not what ships. Changing them is a code change, not a documentation change — do not publish them until the defaults actually say so.
:::

## Why this matters for latency

The comparison that makes HelixID look fast is not "network vs. no network." It is **static reads that cache** vs. **an introspection call that by design cannot cache**.

A token introspection endpoint takes 50–200 ms and must be asked fresh every time — being asked fresh is its entire purpose. A DID document and a status list are the same bytes for every verifier and every request, so they cache, sit on a CDN, and drop to roughly 0.01 ms on a hit.

See [Performance & Caching](../architecture/performance-and-caching.md) for the full numbers, and [Comparisons](../comparisons/why-not-just-use.md) for the OAuth contrast.

## Verifying this yourself

The honest way to check any of the above is a packet capture against the demo. You should see exactly two outbound reads on a cold `did:web` verification — `/.well-known/did.json` and the status list — and none at all on a warm one with a status-list resolver configured. On `did:key`, none in either case.
