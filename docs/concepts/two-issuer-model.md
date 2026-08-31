---
id: two-issuer-model
title: The Two-Issuer Model
sidebar_label: The Two-Issuer Model
sidebar_position: 4
description: Why HelixID has two issuers — a platform issuer that sets the ceiling and a service provider that issues the user's consent grant.
---

# The Two-Issuer Model

:::info[This is a corrected model]
Earlier descriptions of HelixID implied a **single** issuer. The shipped code has **two**, and they issue different credential types from different keys. Collapsing them back into one issuer is the most common way this design gets misread — and it changes the security properties, not just the wording.
:::

Authority in HelixID comes from two independent parties:

| Issuer | Credential | Scope | When issued |
| --- | --- | --- | --- |
| **Platform** (`HELIX_ISSUER_DID`) | `HelixAgentCredential` | `privilegeScopes` — the agent's outer ceiling | Once, at onboarding |
| **Service Provider** (own `did:web`, own keypair, own status list) | `DelegationGrantCredential` ("grant") | SP-owned scope catalog, narrowed by user consent — never exceeds the platform ceiling | Just-in-time, on first `CONSENT_REQUIRED` from that SP |

Authority is the **intersection** of the two. A grant can never widen what the platform issuer gave the agent, and the agent can never act beyond what the user approved for that service.

## Why two

A single issuer would have to answer two questions that belong to different parties:

- *"Is this a real agent, and what class of thing is it?"* — the platform knows this. It onboarded the agent.
- *"Do I, the user, want this agent doing that at this service?"* — only the user can answer this, and only the service provider can present the question in a way the user can meaningfully judge.

Merging them would mean the platform issuer effectively granting consent on the user's behalf to services it has no relationship with. The split keeps the consent decision where the consent actually happens.

It also means a service provider does not have to trust the platform to define its scope catalog. The SP owns its own scopes, its own signing key, and its own revocation — see [locked rules](#locked-rules) below.

## The flow

An agent calls a service provider it has never dealt with:

1. Agent presents only its `agentVC`.
2. SP finds **no matching grant** for this `(service, user)` pair, and returns `CONSENT_REQUIRED` with a `consentUrl` and the `requiredScope`.
3. Agent hands off to the SP's **own consent page** — not a HelixID-hosted one.
4. The user signs in with the SP and sees the scopes on offer (`GET /api/consent/scopes`), then accepts (`POST /api/consent/accept`).
5. **The SP signs and issues the grant VC itself**, and persists it along with its own status list.
6. The agent's wallet stores the grant as an **independent credential** — never merged into `delegationChain`.
7. The agent retries, now presenting `[agentVC, grantVC]`.
8. The SP verifies both and the call succeeds.

Grants are cached per `(serviceDid, userDid)`. A `standing` grant means later calls skip consent entirely — zero new grants and zero widget renders, which the consent demo asserts on as a hard test.

## Presenting both credentials

Both credentials travel in one VP, as separate entries:

```typescript
const vp = await new VPBuilder({
  credentials: [agentVC, grantVC],   // exactly one agent-authority VC + at most one grant
  holderDid: wallet.getDID(),
  userDid: 'did:web:user.example.com',
  targetService: 'airline-sp',
}).sign(wallet.getPrivateKeyHex(), `${wallet.getDID()}#key-1`)
```

`credentials` accepts 1–2 entries: exactly one agent-authority VC, plus at most one consent grant VC.

On the verifier side, the intersection surfaces as `effectiveScopes`:

```typescript
const result = await verifyVP(incomingVP, { expectedTargetService: 'airline-sp' })

// effectiveScopes === privilegeScopes when no grant was presented;
// otherwise it is the intersection of the ceiling and the grant.
if (!result.effectiveScopes.includes('book:flights')) {
  throw new Error('INSUFFICIENT_SCOPE')
}
```

Always enforce on `effectiveScopes`, never on `privilegeScopes` alone — `privilegeScopes` is the ceiling, not the permission.

## Locked rules

These are design invariants, not configuration:

- **Grants are per-`(service, user)`.** One SP's grant never authorizes another SP, and never satisfies a different user. There is no "grant once, use everywhere."
- **A grant never widens the ceiling.** The intersection is computed at verification time; an SP cannot issue itself more authority than the platform gave the agent.
- **A grant is never merged into the delegation chain.** It is an independent credential presented alongside the agent VC, not a link in it. Grants and [sub-delegation](./delegation.md) are separate mechanisms.
- **Revocation is SP-owned.** The SP holds the grant VC and its own status list, and revokes it directly. HelixID keeps no index mapping grants to services — which also means HelixID cannot revoke a grant on an SP's behalf.

## Grants vs. sub-delegation

These are easy to conflate, and they are different mechanisms with different trust directions:

| | Consent grant | Sub-delegation |
| --- | --- | --- |
| Issued by | The service provider | Another agent |
| Approved by | The end user, interactively | No user interaction — the parent agent decides |
| Trust direction | Platform agent → external SP | Agent → agent, inside the platform's own chain |
| Stored as | An independent credential in the wallet | A link in `delegationChain` |
| Revoked by | The SP, via its own status list | The platform issuer, via the root credential |

See [Delegation & Sub-Delegation](./delegation.md) for the second column.

## Seeing it run

[Demo A — user consent across two services](../examples/consent-demo.md) is this model end to end: two independent service providers, each with its own `did:web` identity, its own status list, and its own consent grant. Step 5 of that demo — booking a hotel prompts again, because nothing the airline approved carries over — is the per-`(service, user)` rule made visible.

## Building the consent page

HelixID ships the *contract* for consent, not the page. The SP owns the scope-resolution route and runs it under its own session auth:

```
GET <scopesEndpoint>?agentDid=<did>  →  { scopeOptions }
```

`agentDid` is carried for audit correlation only and **must not change the returned catalog** — the catalog is a property of the service, not of who is asking.

The [`@helixid/widget`](../sdk/widget.md) package provides `resolveConsentScopes()` on the server side and a headless `createConsentController()` for the UI, so the SP keeps full control of presentation.
