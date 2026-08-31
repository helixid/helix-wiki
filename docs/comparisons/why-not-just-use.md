---
id: why-not-just-use
title: Why Not Just Use OAuth / API Keys / Raw Ed25519
sidebar_label: Why Not Just Use...
sidebar_position: 1
description: Honest comparisons — where OAuth, API keys, and raw signing are the right answer, and where they structurally cannot help.
---

# Why Not Just Use...

:::note[HelixID is complementary to OAuth, not a replacement for it]
Use OAuth for sessions and simple internal APIs — it is genuinely good at that. Use HelixID for cross-org trust, delegation chains, and auditable credentials. Neither replaces the other, and any copy implying otherwise is overselling.
:::

## "OAuth/JWT already does this"

OAuth authenticates **users to services**. It was not designed for autonomous agents that spawn sub-agents, cross organizational boundaries, and need delegation chains that a third party can verify without calling back to the issuer.

JWT claims are opaque and custom per system — there's no standard way for Service C to verify that Agent B was delegated authority from Agent A by Organization X without calling Organization X's token server. A HelixID credential carries its own proof: verifying it needs the issuer's public key and its revocation bitstring — two static documents that cache or sit on a CDN — never a live call to the issuer asking whether this request should go through.

### Where each one actually wins

| Scenario | OAuth | HelixID |
| --- | --- | --- |
| Simple internal API call, no delegation, cached token | **~100 ms — use OAuth** | ~120 ms, and added complexity for no benefit |
| Cross-org call with no prior integration | Requires bilateral federation setup | Portable credential, verified from static documents |
| 5-hop delegation chain | 400–800 ms+ (per-hop issuer callbacks) | ~55 ms (local signature verification per hop) |
| Revocation | Rotate or introspect (50–200 ms, uncacheable) | One bit in a cacheable shared bitstring |
| Auditability across org boundaries | Mutable logs on each side | Cryptographically verifiable chain |

The honest summary: **HelixID's latency advantage is in delegation chains, not in single-org calls.** OAuth is faster for simple single-org, no-delegation cases. Position it as "use OAuth for internal APIs — it's perfect there; add HelixID for cross-org APIs and delegation chains."

### On "no pre-wiring needed"

A more precise claim than it is sometimes given: HelixID enables identity proof *without pre-wired bilateral federation*. It does not eliminate the need for organizations to trust each other. It shifts that trust from **infrastructure** (metadata exchange, certificate swapping) to **policy** (an allowlist, or a shared registry). Org A and Org B still have to decide to trust each other — they just don't have to build a pipe first. See [Self-Hosted vs Cloud](../self-hosting/self-hosted-vs-cloud.md#the-trust-model-question-a-hosted-service-would-answer).

## "API keys + RBAC is fine"

For single-tenant, human-supervised agents calling known APIs — sure.

When agents autonomously discover and invoke services across organizations, API keys require bilateral key exchange and RBAC requires a shared permission model. Neither exists in cross-org agent-to-agent scenarios. HelixID provides portable authority that works without prior integration.

The other failure is revocation. An API key is a shared secret held by every service it was ever given to, so revoking a compromised agent means rotating keys everywhere it touched — and every one of those rotations is an outage risk for something unrelated. Revoking a HelixID credential flips one bit, and the agent's other credentials keep working.

## "Ed25519 signing is simpler"

It is simpler, and it proves something narrower.

Ed25519 proves **"this key signed this payload."** HelixID proves **"Organization X attests that Agent Y has Authority Z, verified by anyone, revocable at any time, with a full delegation chain."**

Simple signing gives you cryptographic proof of *origin*. Verifiable credentials give you cryptographic proof of *delegated authority*. These are fundamentally different properties, and the gap between them is exactly where agent authorization lives: a signature tells a verifier who is calling, never what they were permitted to do or whether that permission still stands.

If both parties already share a trust context and no delegation is involved, raw signing is a reasonable choice — which is why HelixID includes it as [Layer 3](../architecture/hybrid-layers.md) rather than arguing against it.

## "Verified ≠ Trusted"

Correct. Verification is necessary but not sufficient.

A perfectly valid credential can still be the wrong credential for the action being attempted, and a genuine signature from an issuer you have no reason to trust is worth nothing. HelixID combines identity, credentialed authority, verification at runtime, audit evidence, and revocation controls so trust decisions can be made from cryptographic proof instead of shared secrets — but *whose* proof you accept remains a policy decision you own.

See [Authorization & Scopes](../concepts/authorization-and-scopes.md) for the enforcement side of this.
