---
id: delegation
title: Delegation & Sub-Delegation
sidebar_label: Delegation & Sub-Delegation
sidebar_position: 5
description: How one agent grants a bounded subset of its authority to another, and what the verifier enforces along the chain.
---

# Delegation & Sub-Delegation

When Agent A spawns Agent B to do part of a job, B needs authority to act — and the service B calls needs to know that authority is real and bounded. That is the gap no API key can express: a key held by B says nothing about A having authorized it.

HelixID's answer: **Agent A issues a scoped, time-bound credential to Agent B.** When B presents, the credential carries its chain back to an issuer-backed root. The verifier validates the full chain. Trust is transitive but bounded — B cannot exceed A's permissions.

## Delegating

Agent keys are held in custody, so delegation is an API call: HelixID signs the child credential with the delegating agent's key.

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { HelixClient } from '@helixid/sdk-js';

const client = new HelixClient(process.env.HELIX_API_URL!, {
  adminApiKey: process.env.HELIX_ADMIN_API_KEY!,
});

const delegatedCredential = await client.delegateAuthority(
  plannerAgentDid,          // the agent delegating
  researchAgentDid,         // the agent receiving
  ['read:catalog'],         // a subset of the delegator's scopes
  3600,                     // seconds until the delegation expires
);

console.log(
  delegatedCredential.id,
  delegatedCredential.credentialSubject.privilegeScopes,
  delegatedCredential.credentialSubject.delegationDepth,
);
```

</TabItem>
<TabItem value="py" label="Python">

```python
import os
from helix_sdk import HelixClient

client = HelixClient(
    os.environ["HELIX_API_URL"],
    admin_api_key=os.environ["HELIX_ADMIN_API_KEY"],
)

delegated_credential = client.delegate_authority(
    planner_agent_did,      # the agent delegating
    research_agent_did,     # the agent receiving
    ["read:catalog"],       # a subset of the delegator's scopes
    3600,                   # seconds until the delegation expires
)
```

</TabItem>
</Tabs>

The call maps to `POST /v1/agents/:did/delegate`. A few rules apply before anything is signed:

- **The delegatee must be an agent.** It has to be onboarded on the same HelixID server and still hold an active credential; delegating to an unknown DID is refused with `DELEGATEE_NOT_AN_AGENT`.
- **The source must be issuer-backed.** The credential delegated from is one of the delegator's active `HelixAgentCredential`s. Pass `vcId` to pick one when the agent holds several.
- **Scopes can only shrink.** The requested scopes must be a subset of the source credential's.
- **Depth must allow it.** The source credential's `maxDelegationDepth` must leave room for one more hop.

:::note[Who can ask]
On a self-hosted server the delegate route is gated by the admin key, the same trust already placed in that key for issuing and revoking credentials. There is no per-agent secret narrower than that in the open-source server. See [Security Model](../security/security-model.md#key-custody).
:::

## What the verifier enforces

Verification walks the entire chain and checks:

1. **Signature at every hop.** Each child was signed by the key of the agent its parent names.
2. **Linkage.** Each child's issuer, `delegatedFrom` and `parentVcId` match its parent, and `delegationDepth` increases by exactly one per hop.
3. **Scope subsetting.** A child's `privilegeScopes` must be a subset of its parent's. A delegation cannot introduce a scope the parent did not hold.
4. **Depth.** `delegationDepth` must not exceed the `maxDelegationDepth` set on the root credential, and that limit cannot change part-way down the chain.
5. **Validity and revocation at every hop.** Every credential in the chain must be inside its validity window and unrevoked.
6. **An issuer-backed root.** The chain must start at a credential signed by an issuer, never a self-signed one.

A broken parent breaks the chain: if *any* parent or intermediate credential is expired, revoked, missing, tampered with, invalidly signed, or incorrectly linked, the delegated credential is not accepted. There is no partial credit for a chain that is valid up to the last hop.

The chain check itself is computed from data inside the presentation plus each signer's public key — no party along the chain is asked to vouch for this request. That is the property a per-hop token exchange cannot give you; see [Comparisons](../comparisons/why-not-just-use.md).

## Depth limits

`maxDelegationDepth` is set at issuance — by the operator when minting an enrollment token (`POST /v1/enrollment-tokens`), or with `--max-delegation-depth` on `helix vc issue`.

**Root agent credentials default to `maxDelegationDepth = 0`** — delegation is impossible unless the agent's operator explicitly allows it. That default is deliberate: an agent that was never meant to spawn helpers cannot be talked into it.

Set the value explicitly on every credential you issue, and keep it small.

## Revoking a delegation

Each delegated credential gets its own entry on the status list, so it can be revoked on its own with `POST /v1/vcs/:vcId/revoke` without touching the parent. Revoking a parent also cuts off everything derived from it, because the chain no longer verifies.

Delegating again to the same agent with the same scopes replaces the earlier credential. A delegation with a different scope set stands beside the existing ones unless you pass `revokeExisting`.

## Delegation and consent grants are different things

A [consent grant](./two-issuer-model.md) from a service is **not** part of the delegation chain. It is an independent credential presented alongside the agent's credentials.

| | Sub-delegation | Consent grant |
| --- | --- | --- |
| Issued in the name of | The delegating agent | The service |
| Approved by | The parent agent's operator | The end user, interactively |
| Presented as | A link in `delegationChain` | A separate credential in the presentation |
| Bounded by | The parent's scopes and `maxDelegationDepth` | The agent's own scopes |

The two meet in one place. When a user has consented to a parent agent at a service, a sub-agent acting for that user can rely on the parent's grant — but only for authority delegated from that parent, and only if the grant was not issued with `allowDelegation: false`.

## Audit

Delegation is recorded as `VC_DELEGATED`, and verification results carry the verified `delegationChain` — issuer, subject, credential id, scopes and depth for each link — so a delegated call is as reconstructible as a direct one.

## Seeing it run

[Use case 4 of the Travel Concierge demo](../examples/travel-concierge.md) exercises this: a Planner agent holding `read:catalog` + `write:orders` delegates only `read:catalog` to a Research agent. Research can search through the delegated credential, but booking is refused — the delegated credential never carried `write:orders`.

There is also a standalone script, [`examples/delegation-demo.ts`](../examples/delegation-chain.md).
