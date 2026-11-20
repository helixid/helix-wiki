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

## The passport and the visas

The stack is easier to hold in your head with a travel analogy, because an agent's identity and its permissions really do come from different places.

| Analogy | What it is in HelixID | Who issues it | Answers |
| --- | --- | --- | --- |
| **Passport** | The agent's [DID](./dids-and-identity.md) | Created when the agent is onboarded | *Who is this agent, and who vouches for it?* |
| **Base visa** | `HelixAgentCredential` | The HelixID issuer that onboarded the agent | *What is the most this agent could ever be allowed to do?* |
| **Service visa** | `DelegationGrantCredential` | The service, after the user says yes on its consent page | *What may it do here, for this user?* |

A passport is issued once and checked anywhere. A base visa sets the outer limit. A service visa is valid only at the service that issued it, cannot say more than the base visa allows, and a passport alone does not get an agent through the gate when it is acting for a user.

The border officer checks all of them against published records — the issuer's public key and its list of revoked documents — rather than phoning the issuing authority about this particular traveller. That last detail is the whole [verification argument](./offline-verification.md) in one image.

Read the mechanics in [The Two-Issuer Model](./two-issuer-model.md).

## Layer 1 — Identity

Every agent gets a [DID](./dids-and-identity.md) bound to an Ed25519 keypair. HelixID generates the keypair when the agent is onboarded and keeps the private key encrypted in custody; the agent itself holds no key and no wallet file, only its DID. When the agent needs to present credentials, it asks HelixID to sign on its behalf. See [Security Model](../security/security-model.md) for what that custody means.

Because a DID resolves to a public key without a shared secret, a verifier that has never met this agent can still check its signature.

## Layer 2 — Authority

Identity says *who*. Authority says *what they may do*. HelixID expresses authority as [W3C Verifiable Credentials](./verifiable-credentials.md) carrying `privilegeScopes`, a validity window, and — when the credential is delegated — a chain back to an issuer-backed root.

Two things bound authority:

- **The ceiling** (the base visa), set by the platform issuer at onboarding, which no downstream credential can widen.
- **The grant** (the service visa), issued in the service's name after the user consents, which narrows the ceiling to what was actually approved for that one service.

The enforcement value is what both allow: `effectiveScopes`.

## Layer 3 — Enforcement

A credential nobody checks is decoration. Enforcement happens at the execution boundary — in the service's own handler after `verifyVP()`, or inside the [MCP middleware](../integrations/mcp.md) — before the tool runs.

`verifyVP()` sends the presentation to a HelixID API, which checks the VP signature, each credential's signature, the validity windows, revocation, the target service, and the delegation chain, and returns the scopes that apply. What it deliberately does **not** do is decide your business rules: the scope a call requires and replay protection are the verifier's own calls, because only the verifier knows its threat model. See [Authorization & Scopes](./authorization-and-scopes.md).

## Layer 4 — Audit

Every step of the chain is recordable — issuance, consent, presentation signing, verification, the authorization decision, and the action that followed. The event types are listed in the [HTTP API reference](../sdk/http-api.md).

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
