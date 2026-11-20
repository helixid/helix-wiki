---
id: verifiable-credentials
title: Verifiable Credentials
sidebar_label: Verifiable Credentials
sidebar_position: 3
description: The credential types HelixID issues, the fields that carry authority, and how a Verifiable Presentation is built and checked.
---

# Verifiable Credentials

A **Verifiable Credential (VC)** is a signed statement by an issuer about a subject. A **Verifiable Presentation (VP)** is a short-lived, signed envelope in which a holder presents one or more credentials to a specific verifier.

HelixID follows the [W3C VC Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/). The distinction that matters in practice: the VC is long-lived and issued once; the VP is signed fresh per interaction, bound to a target service, and expires in minutes.

## Credential types

| Type | Issued under | Carries | When |
| --- | --- | --- | --- |
| `HelixAgentCredential` | The platform issuer's DID | `privilegeScopes` — the agent's outer ceiling (the "base visa") | Once, at onboarding |
| `DelegationGrantCredential` | The service's DID | The scopes the user consented to, for that one service (the "service visa") | When the user consents on the service's consent page |
| Delegated `HelixAgentCredential` | The delegating agent's DID | A subset of the parent's scopes, at greater `delegationDepth` | Whenever an agent sub-delegates |

`HelixAgentCredential` and `DelegationGrantCredential` come from **different issuers** and are never merged. That model is covered in [The Two-Issuer Model](./two-issuer-model.md). Delegated credentials are covered in [Delegation & Sub-Delegation](./delegation.md).

## Fields that carry authority

These are the Helix-specific terms that verification actually reads.

On an agent credential:

| Field | Meaning |
| --- | --- |
| `privilegeScopes` | What this credential permits — the authority ceiling for its holder |
| `delegatedFrom` | The DID of the agent that delegated this credential, when it is a delegated child |
| `delegationDepth` | How many hops from the issuer-backed root this credential sits at |
| `maxDelegationDepth` | The furthest any descendant of the root may go |
| `parentVcId` | The credential this one was derived from, used to walk the chain |
| `credentialStatus` | Where to find the revocation bit for this credential |
| `validFrom` / `validUntil` | The validity window. `validUntil` is optional: a credential without it does not expire and ends only by revocation |

On a consent grant (`credentialSubject`):

| Field | Meaning |
| --- | --- |
| `id` | The agent being authorized |
| `userDid` | The consenting user, recorded as the service gave it — a DID or another stable identifier such as an email address |
| `scopes` | What the user approved |
| `durability` | `standing` (valid until revoked) or `session` (24 hours) |
| `allowDelegation` | Whether the consent also covers agents this agent delegates to. Absent means allowed |

:::note[Expiry is optional]
An agent onboarded from an enrollment token gets a credential that expires only if the token was created with an `expiry`. A credential issued directly with `POST /v1/vcs` defaults to 90 days. If you rely on expiry to limit exposure, set it explicitly.
:::

## Scopes

Scopes are plain strings. HelixID does not impose a vocabulary or a format: `read:orders`, `flights.book` and `orders:admin` are all valid. A scope may not contain whitespace or commas, is at most 255 characters, and is compared exactly — there are no wildcards and no hierarchy. A credential carries at most 50.

The service owns its own catalog, since only it knows what its tools do.

Three scope values matter at verification time:

- **`privilegeScopes`** — what the agent's credentials permit.
- **The consent grant's scopes** — what the user approved for this service.
- **`effectiveScopes`** — the enforcement field. Identical to `privilegeScopes` unless the presentation carried a consent grant, in which case it is what both allow.

Always enforce on `effectiveScopes`. See [Authorization & Scopes](./authorization-and-scopes.md).

## Getting a Verifiable Presentation

Agents hold no keys, so a presentation is requested from HelixID rather than built locally:

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
const vp = await client.signVP(agentDid, serviceDid, {
  userDid: 'did:web:user.example.com',   // only when acting for a user
})
```

</TabItem>
<TabItem value="py" label="Python">

```python
vp = client.sign_vp(agent_did, service_did, user_did="did:web:user.example.com")
```

</TabItem>
</Tabs>

The call maps to `POST /v1/agents/:did/vp`. The caller does not choose the credentials. HelixID includes:

- every active `HelixAgentCredential` the agent holds — its own and any delegated to it; and
- when `userDid` is given, every active grant the target service issued to this agent for that user. If there is none, signing is refused with `CONSENT_GRANT_NOT_FOUND`: the user has not consented yet.

`targetService` must be the service's **DID**. It binds the presentation to one verifier, so a presentation captured by service A is rejected by service B. The presentation expires **5 minutes** after signing.

How the presentation travels to the service — an `Authorization: HelixVP` header, or MCP `_meta` — is covered in the [SDK reference](../sdk/sdk-js.md) and [MCP integration](../integrations/mcp.md).

## What verification checks

```typescript
import { verifyVP } from '@helixid/sdk-js'

const result = await verifyVP(incomingVP, client, {
  expectedTargetService: serviceDid,
})
```

`verifyVP()` sends the presentation to a HelixID API (`POST /v1/vp/verify`), which checks:

1. **Presentation expiry and signature**, against the holder's DID public key
2. **Target service** matches `expectedTargetService`
3. **Each credential's signature**, against its issuer's DID public key
4. **Validity windows** on each credential
5. **Revocation**, for every credential that carries a `credentialStatus`
6. **Delegation chain integrity** — linkage, scope subsetting and depth limits along the whole chain
7. **Consent rules** — a named user must be backed by a grant, from the target service, for this agent and this user

A presentation may carry several agent credentials and several grants. A credential that has been revoked or has expired is dropped and the rest still count; any other failure — a bad signature, a broken chain, a grant for the wrong service — rejects the whole presentation. If nothing valid is left, verification fails.

What it deliberately leaves to you: **the scope a call requires** and **replay protection**.

:::warning[A presentation is not single-use]
Neither the API nor the SDK remembers which presentations have been accepted. The same presentation verifies again until it expires. `vpId` is returned so you can reject repeats against your own store — see [Authorization & Scopes](./authorization-and-scopes.md#replay-protection-is-yours).
:::

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
| Check status | `GET /v1/vcs/:vcId/status` | `HelixClient.checkVCStatus()` → `active` / `revoked` / `expired` |
| Renew | `POST /v1/vcs/:vcId/renew` | `HelixClient.renewVC()` |
| Revoke | `POST /v1/vcs/:vcId/revoke` | `HelixClient.revokeVC()`, `helix revoke` |
| Record a credential signed elsewhere | `POST /v1/vcs/register` | `HelixClient.registerVC()` |

Issue, revoke and renew require the `x-admin-api-key` header on a self-hosted server. Renewal issues a **new** credential from an existing one.

Issuing a credential that matches an active one follows one rule everywhere: the same subject with the same scope set **replaces** the old credential; a different scope set **stands beside** it; and `revokeExisting` clears the others. A credential that still has live delegations hanging off it is kept rather than revoked out from under them.

## JSON-LD context

<span className="helix-badge helix-badge--planned">Planned</span>

Issued HelixID VCs reference two contexts: `https://www.w3.org/ns/credentials/v2` (hosted by W3C) and a HelixID-specific context that is **not yet hosted**.

Today the API and SDK verification path uses local canonical JSON signing and does not fetch the custom context, so local and self-hosted flows work. Hosting it — and defining the Helix-specific terms listed above — is required before HelixID can claim full public JSON-LD/VC ecosystem interoperability. See the [Roadmap](../roadmap.md).
