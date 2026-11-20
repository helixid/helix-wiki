---
id: two-issuer-model
title: The Two-Issuer Model
sidebar_label: The Two-Issuer Model
sidebar_position: 4
description: Why HelixID has two issuers — a platform issuer that sets the ceiling and a service that issues the user's consent grant.
---

# The Two-Issuer Model

:::info[Two issuers, not one]
HelixID has **two** issuers, and they issue different credential types under different DIDs and different keys. Collapsing them back into one issuer is the most common way this design gets misread — and it changes the security properties, not just the wording.
:::

Authority in HelixID comes from two independent parties:

| | Base visa | Service visa |
| --- | --- | --- |
| Credential type | `HelixAgentCredential` | `DelegationGrantCredential` ("grant") |
| Issued under | The platform issuer's DID (`HELIX_ISSUER_DID`) | The service's own DID |
| Carries | `privilegeScopes` — the agent's outer ceiling | The scopes the user approved at this service |
| When | Once, when the agent is onboarded | When the user consents on the service's consent page |
| Valid at | Any service | Only the service that issued it |

The agent's DID is its passport; these two credentials are the visas stamped against it. A grant can never widen what the platform issuer gave the agent, and the agent can never act for a user beyond what that user approved at that service.

## Why two

A single issuer would have to answer two questions that belong to different parties:

- *"Is this a real agent, and what class of thing is it?"* — the platform knows this. It onboarded the agent.
- *"Do I, the user, want this agent doing that at this service?"* — only the user can answer this, and only the service can present the question in a way the user can meaningfully judge.

Merging them would mean the platform issuer effectively granting consent on the user's behalf to services it has no relationship with. The split keeps the consent decision where the consent actually happens: on the service's own consent page, in the service's own session, recorded under the service's own DID.

It also means a service does not have to accept a scope vocabulary from anyone else. The service owns its scope catalog.

## Services are enrolled identities

A service is enrolled with HelixID the same way an agent is onboarded: HelixID creates the service's DID, generates its keypair, and holds the private key in custody.

```bash
curl -X POST "$HELIX_API_URL/v1/services" \
  -H "content-type: application/json" \
  -H "x-admin-api-key: $HELIX_ADMIN_API_KEY" \
  -d '{
    "name": "xyz-airways",
    "domain": "api.xyz-airways.example",
    "requiredScopes": ["flights.search", "flights.book"]
  }'
```

That DID (`did:web:<domain>:services:<slug>` under `did:web`) is what agents name as `targetService` when they sign a presentation, and it is the `issuer` on every grant the service gives out.

:::note[Changed in `@helixid/core` 3.0.0]
Earlier releases had the service keep its own signing key and host its own status list, with a two-step prepare/finalize exchange so it could sign each grant itself. In 3.0.0 the service's key is held in custody like an agent's, and issuing a grant is one authenticated API call. A grant signed elsewhere can still be recorded with `POST /v1/vcs/register`, which checks the signature against the issuer's DID document before storing it.
:::

## The flow

An agent wants to act for a user at a service the user has not yet approved it for:

1. The agent asks HelixID to sign a presentation for that service and that user: `signVP(agentDid, serviceDid, { userDid })`.
2. HelixID finds no active grant from that service to this agent for that user and refuses with `CONSENT_GRANT_NOT_FOUND`.
3. The agent sends the user to the **service's own consent page** — not a HelixID-hosted one.
4. The user signs in with the service and sees the scopes on offer. The service's backend builds that list with `getAgentScopes()` — or [`@helixid/widget`](../sdk/widget.md)'s `resolveConsentScopes()` — so it only ever offers scopes this agent actually holds.
5. The user accepts. The service's backend calls `issueServiceDelegationGrant()`. HelixID signs the grant with the service's key, gives it a revocable status entry and stores it.
6. The agent asks for a presentation again. This time HelixID includes the grant alongside the agent's own credential.
7. The service verifies the presentation and the call succeeds, with `effectiveScopes` limited to what the user approved.

```typescript
// Service backend, after the user clicks Allow
const grant = await client.issueServiceDelegationGrant({
  serviceDid,
  agentDid,
  userDid: 'did:web:user.example.com',   // or the user's identifier at this service
  scopes: ['flights.search', 'flights.book'],
  durability: 'standing',
})
```

A `standing` grant stays valid until it is revoked, so later calls skip consent. A `session` grant expires after 24 hours.

## What the verifier sees

Both credentials travel in one presentation, as separate entries. The agent never assembles this itself — HelixID picks every active credential the agent holds, adds the grants that match the service and user, and signs.

On the verifier side, the result surfaces as `effectiveScopes`:

```typescript
const result = await verifyVP(incomingVP, client, { expectedTargetService: serviceDid })

// effectiveScopes === privilegeScopes when the presentation names no user;
// with a user, it is what the grant and the agent's ceiling both allow.
if (!result.effectiveScopes.includes('flights.book')) {
  throw new Error('INSUFFICIENT_SCOPE')
}
```

Always enforce on `effectiveScopes`, never on `privilegeScopes` alone — `privilegeScopes` is the ceiling, not the permission.

## Rules the verifier enforces

These are design invariants, not configuration:

- **A grant is valid only at the service that issued it.** The grant's issuer must equal the presentation's `targetService`; otherwise verification fails with `CONSENT_GRANT_WRONG_SERVICE`. There is no "grant once, use everywhere."
- **A grant is for one user and one agent.** A grant for a different user or a different agent is rejected outright (`CONSENT_GRANT_SUBJECT_MISMATCH`), not ignored.
- **Naming a user requires that user's consent.** A presentation that says it acts for a user but carries no grant is rejected (`CONSENT_GRANT_REQUIRED`).
- **A grant never widens the ceiling.** Issuance refuses any scope the agent does not hold in its own right (`CONSENT_GRANT_SCOPE_NOT_ALLOWED`), and verification intersects the grant with the agent's authority again.
- **Consent can follow delegation, if the user allows it.** When an agent delegates to a sub-agent, the user's grant to the parent covers the sub-agent only for the authority delegated from that parent — and not at all if the grant was issued with `allowDelegation: false` (`CONSENT_GRANT_NOT_DELEGABLE`).
- **A grant is never part of the delegation chain.** It is an independent credential presented alongside the agent's credentials. Grants and [sub-delegation](./delegation.md) are separate mechanisms.
- **Each grant is individually revocable.** It has its own status entry; revoking it does not touch the agent's credential or any other grant. See [Revocation](./revocation.md).

## Grants vs. sub-delegation

These are easy to conflate, and they are different mechanisms with different trust directions:

| | Consent grant | Sub-delegation |
| --- | --- | --- |
| Issued in the name of | The service | The delegating agent |
| Approved by | The end user, interactively | No user interaction — the parent agent's operator decides |
| Trust direction | User → agent, at one service | Agent → agent |
| Presented as | An independent credential | A link in the credential's `delegationChain` |
| Limits | The agent's own scopes | The parent's scopes and `maxDelegationDepth` |

See [Delegation & Sub-Delegation](./delegation.md) for the second column.

## Building the consent page

HelixID ships the *contract* for consent, not the page. The service owns the page, its session auth, and its scope catalog. The [`@helixid/widget`](../sdk/widget.md) package provides `resolveConsentScopes()` for the backend and a headless `createConsentController()` for the UI, so the service keeps full control of presentation.

## Seeing it run

[Demo A — user consent across two services](../examples/consent-demo.md) shows the model end to end: two independent services, each with its own identity and its own consent. Booking a hotel prompts again after the airline was approved, because nothing the airline's grant says carries over.
