---
id: trust-stack
title: The 5-Layer Trust Stack
sidebar_label: The 5-Layer Trust Stack
sidebar_position: 1
description: Identity, authority, enforcement, audit, and revocation — and why an identity library alone is not enough.
---

# The 5-Layer Trust Stack

HelixID is a **5-layer trust stack** for AI agents, not just an identity library. Each layer answers a different question, and skipping one leaves a gap the others cannot cover.

| Layer | What It Does | How |
| --- | --- | --- |
| **1. Identity** | Every agent gets a DID (Decentralized Identifier) bound to a cryptographic keypair | W3C DID (`did:web` default, `did:key` local, `did:hedera` optional) |
| **2. Authority** | Scoped, time-bound credentials that prove what an agent is allowed to do | W3C Verifiable Credentials with delegation chains |
| **3. Enforcement** | Runtime verification and authorization checks at execution boundaries | SDK/core verification + verifier-owned policy checks |
| **4. Audit** | Ordered record of the whole chain — issuance, consent, presentation, verification, authorization, action, result | Adapter-based `audit_log` store + structured stdout/file |
| **5. Revocation** | Decentralized revocation read as a static, cacheable document — no per-credential call to the issuer | Bitstring Status List |

## The passport and the visa

The stack is easier to hold in your head with a travel analogy, because HelixID's credentials really do come from two different authorities.

The **Agent-Authority VC** is a passport. Your government issues it once, it says who you are and what class of traveller you are, and it sets an outer limit on where you can go. It is not permission to enter any particular country.

The **Delegated Grant VC** is a visa. The destination country issues it, after *you* apply and *they* approve, and it is valid only for that country. A visa cannot make your passport say something it doesn't, and a passport alone doesn't get you through the gate.

The border officer checks both — and checks them against a printed list of revoked documents, not by phoning your government about you specifically. That last detail is the whole [offline verification](./offline-verification.md) argument in one image.

Read the mechanics in [The Two-Issuer Model](./two-issuer-model.md).

## Layer 1 — Identity

Every agent gets a [DID](./dids-and-identity.md) bound to an Ed25519 keypair. The private key is generated inside the agent process, encrypted at rest in the agent's wallet, and never leaves. The issuer never sees it.

Because a DID resolves to a public key without a shared secret, a verifier that has never met this agent can still check its signature.

## Layer 2 — Authority

Identity says *who*. Authority says *what they may do*. HelixID expresses authority as [W3C Verifiable Credentials](./verifiable-credentials.md) carrying `privilegeScopes`, a validity window, and — when the credential is delegated — a chain back to an issuer-backed root.

Two things bound authority:

- **The ceiling**, set by the platform issuer at onboarding, which no downstream credential can widen.
- **The grant**, issued by the service provider after the user consents, which narrows the ceiling to what was actually approved for that one service.

The enforcement value is the intersection: `effectiveScopes`.

## Layer 3 — Enforcement

A credential nobody checks is decoration. Enforcement happens at the execution boundary — inside `verifyVP()`, inside the MCP middleware, inside the LangChain tool wrapper — before the tool runs.

`verifyVP()` checks the VP signature, the VC signature, the validity window, revocation, the target service, and the delegation chain. What it deliberately does **not** do is decide your business rules: replay protection and the scope requirement are the verifier's own calls, because only the verifier knows its threat model. See [Authorization & Scopes](./authorization-and-scopes.md).

## Layer 4 — Audit

Every step of the chain is recordable: `VC_ISSUED`, `CONSENT_GRANTED`, `VC_PRESENTED`, `VP_VERIFIED`, `VP_REJECTED`, `AUTHZ_GRANTED`, `AUTHZ_DENIED`, `TOOL_INVOKED`, `CONSENT_REVOKED`.

Refusals are recorded as clearly as approvals. An audit trail that only shows successes cannot answer "did anything try and fail?", which is usually the more interesting question. Events are written through an adapter-based `audit_log` store plus structured stdout or file output, and are readable via `GET /v1/audit-log` or the operator Console.

## Layer 5 — Revocation

Revocation uses a [Bitstring Status List](./revocation.md): one gzip-compressed, base64url-encoded bitstring covering every credential an issuer has ever signed. Revoking flips one bit.

This is deliberately a static shared document rather than a per-credential lookup. It is cacheable, it sits well on a CDN, and it does not tell the issuer which credential a verifier was curious about. The trade-off is cache staleness — the window between flipping the bit and every verifier noticing is a real operational parameter, covered in [Performance & Caching](../architecture/performance-and-caching.md).

## Why five and not one

Each layer fails differently, and each failure is one that an "identity library" alone would not catch:

- Identity without authority gives you an agent you can name but not constrain.
- Authority without enforcement gives you a credential nobody checks.
- Enforcement without audit gives you decisions you cannot reconstruct afterwards.
- All four without revocation gives you a compromised agent you cannot stop without rotating every key it ever touched — the exact failure mode API keys already have.
