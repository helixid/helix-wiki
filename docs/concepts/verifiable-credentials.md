---
id: verifiable-credentials
title: Verifiable Credentials
sidebar_label: Verifiable Credentials
sidebar_position: 3
description: The credential types HelixID issues, the fields that carry authority, and how a Verifiable Presentation is built and checked.
---

# Verifiable Credentials

A **Verifiable Credential (VC)** is a signed statement by an issuer about a subject. A **Verifiable Presentation (VP)** is a short-lived, signed envelope in which a holder presents one or more credentials to a specific verifier.

HelixID follows the [W3C VC Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/). The distinction that matters in practice: the VC is long-lived and issued once; the VP is minted fresh per interaction, bound to a target service, and expires in minutes.

## Credential types

| Type | Issued by | Carries | When |
| --- | --- | --- | --- |
| `HelixAgentCredential` | The platform issuer | `privilegeScopes` — the agent's outer ceiling | Once, at onboarding |
| `DelegationGrantCredential` | The service provider | Scopes the user actually consented to, for that one service | Just-in-time, on first `CONSENT_REQUIRED` |
| Delegated child VC | Another agent | A subset of the parent's scopes, at greater `delegationDepth` | Whenever an agent sub-delegates |

`HelixAgentCredential` and `DelegationGrantCredential` come from **different issuers** and are never merged. That model is covered in [The Two-Issuer Model](./two-issuer-model.md). Delegated child VCs are covered in [Delegation & Sub-Delegation](./delegation.md).

## Fields that carry authority

These are the Helix-specific terms that verification actually reads:

| Field | Meaning |
| --- | --- |
| `privilegeScopes` | What this credential permits — the authority ceiling for its holder |
| `agentName` | Human-readable label for the agent, for audit and consent UI |
| `delegatedFrom` | The DID that signed this credential into existence, when it is a delegated child |
| `delegationDepth` | How many hops from the issuer-backed root this credential sits at |
| `maxDelegationDepth` | The furthest any descendant of this credential may go |
| `parentVcId` | The credential this one was derived from, used to walk the chain |
| `credentialStatus` | Where to find the revocation bit for this credential |
| `validUntil` | Expiry — checked on every verification |

## Scopes

Scopes are plain strings, conventionally `verb:resource` — `read:orders`, `write:orders`, `read:catalog`, `book:flights`. HelixID does not impose a scope vocabulary; the service provider owns its own catalog, since only it knows what its tools do.

Three scope values matter at verification time:

- **`privilegeScopes`** — what the agent's credential permits.
- **The consent grant's scopes** — what the user approved for this service.
- **`effectiveScopes`** — the enforcement field. Identical to `privilegeScopes` unless the VP carried a consent grant, in which case it is the intersection of the two.

Always enforce on `effectiveScopes`. See [Authorization & Scopes](./authorization-and-scopes.md).

## Building a Verifiable Presentation

```typescript
import { VPBuilder } from '@helixid/sdk-js'

const vp = await new VPBuilder({
  credentials: [wallet.credentials[0]],   // add a consent grant VC as a second entry when one applies
  holderDid: wallet.getDID(),
  userDid: 'did:web:user.example.com',
  targetService: 'orders-service',
}).sign(wallet.getPrivateKeyHex(), `${wallet.getDID()}#key-1`)
```

`credentials` carries **1–2 entries**: exactly one agent-authority VC, plus at most one consent grant VC. `userDid` is optional — when omitted, `delegatedBy` is absent from the payload.

Signing is entirely local. No network call, no issuer involvement.

`targetService` binds the presentation to one verifier, so a VP captured by service A cannot be replayed against service B. The VP also carries its own short expiry, governed by `VP_TTL_SECONDS` (default 300 seconds).

## What verification checks

```typescript
import { verifyVP } from '@helixid/sdk-js'

const result = await verifyVP(incomingVP, {
  expectedTargetService: 'orders-service',
})
```

`verifyVP()` checks, in-process:

1. **VP signature** against the holder's DID public key
2. **VC signature** against the issuer's DID public key
3. **Validity windows** on both the VP and the embedded VC
4. **Revocation**, when the VC carries a `credentialStatus`
5. **Target service** matches `expectedTargetService`
6. **Delegation chain integrity** — signatures, scope subsetting, and depth limits along the whole chain

What it deliberately leaves to you: **replay protection** and **the scope requirement**. `vpId` is returned so you can implement replay tracking against your own store.

:::warning[If you self-verify, replay protection is your obligation]
If you verify presentations yourself rather than calling `POST /v1/vp/verify`, you must store every `signedVP.id` you have successfully verified and reject any later request presenting the same `id`. The API's verify endpoint does this for you. Self-verifying without it leaves you open to replay attacks.
:::

## Self-issued credentials

`selfIssueVC()` (and `helix vc self-issue`) create a credential signed by the agent's own key. This exists so the [5-minute quick start](../get-started/quick-start.md) can run with no infrastructure at all.

A self-issued VC carries **no issuer-attested authority**. Verifiers reject it by default — `allowSelfSigned` defaults to `false` — and it is never accepted as a trusted delegation root. It is not valid for production, nor for demos meant to prove trust, revocation, or delegation.

## Verifying by hand

The proof format is deliberately simple enough to re-implement, which is the point of a standards-based credential. To check a VP signature yourself:

1. Remove `proof` from the VP payload.
2. Canonicalize the JSON with recursively sorted keys.
3. SHA-256 the canonical JSON bytes.
4. Decode `proof.proofValue` from base58btc.
5. Verify the Ed25519 signature with the holder's public key.

Then reject if `expirationDate` on either the VP or the embedded VC is not in the future, and check the [status list bit](./revocation.md).

## Credential lifecycle

| Step | API | SDK / CLI |
| --- | --- | --- |
| Issue | `POST /v1/vcs` | `HelixClient.issueVC()`, `helix vc issue` |
| Fetch | `GET /v1/vcs/:vcId` | `HelixClient.getVC()` |
| List | `GET /v1/vcs` | `HelixClient.listVCs()` |
| Renew | `POST /v1/vcs/:vcId/renew` | `HelixClient.renewVC()` |
| Revoke | `POST /v1/vcs/:vcId/revoke` | `HelixClient.revokeVC()`, `helix revoke` |
| Check status | — | `HelixClient.checkVCStatus()` → `active` / `revoked` / `expired` |

Issue, revoke, and renew require the `x-admin-api-key` header. Renewal issues a **new** credential from an existing one, with optional scope and expiry overrides; store it with `AgentWallet.addCredential()` or `updateCredential()`.

## JSON-LD context

<span className="helix-badge helix-badge--planned">Planned</span>

Issued HelixID VCs reference two contexts: `https://www.w3.org/ns/credentials/v2` (hosted by W3C) and a HelixID-specific context that is **not yet hosted**.

Today the API and SDK verification path uses local canonical JSON signing and does not fetch the custom context, so local and self-hosted flows work. Hosting it — and defining the Helix-specific terms listed above — is required before HelixID can claim full public JSON-LD/VC ecosystem interoperability. See the [Roadmap](../roadmap.md).
