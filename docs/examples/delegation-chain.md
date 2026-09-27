---
id: delegation-chain
title: Delegation Chain
sidebar_label: Delegation Chain
sidebar_position: 4
description: A standalone script showing one agent sub-delegating a reduced credential to another.
---

# Delegation Chain

[`examples/delegation-demo.ts`](https://github.com/helixid/helixid/tree/main/examples/delegation-demo.ts) is the smallest complete picture of agent-to-agent delegation: one agent delegates a reduced credential to another, and a verifier walks the resulting chain. Neither agent holds a key — both are onboarded server-side, and HelixID signs on their behalf.

## The shape of it

```typescript
import { HelixClient, verifyVP } from '@helixid/sdk-js';

const client = new HelixClient(process.env.HELIX_API_URL!, { adminApiKey: process.env.HELIX_ADMIN_API_KEY! });

// Parent agent — onboarded with an issuer-backed credential and maxDelegationDepth=1
const parent = await client.onboardAgent(parentEnrollmentToken);

// Child agent — has a DID, no authority of its own yet
const child = await client.onboardAgent(childEnrollmentToken);

// HelixID signs a scoped-down child credential with the parent's custodial key
const childVC = await client.delegateAuthority(
  parent.agentDid,
  child.agentDid,
  ['read:analytics'],   // must be a subset of the parent's scopes
  3600,
);

// The child presents its delegated credential
const vp = await client.signVP(child.agentDid, 'analytics-service', { vcId: childVC.id });

// The verifier walks the whole chain back to the issuer-backed root
const result = await verifyVP(vp, client, { expectedTargetService: 'analytics-service' });

console.log(result.valid, result.effectiveScopes);
```

## What to notice

- **The child VC is signed by the parent's key, not the issuer's.** HelixID holds the parent's key and signs on its behalf; the chain is still agent-signed.
- **The child's scopes must be a subset.** Asking for a scope the parent does not hold is refused with `SCOPE_ESCALATION_DENIED` before anything is signed.
- **The root must be issuer-backed.** A credential whose issuer is its own subject is never accepted as a delegation root.
- **`delegationDepth` increments, `maxDelegationDepth` bounds it.** A parent issued with `maxDelegationDepth` 1 produces children that cannot delegate further — the attempt is refused with `MAX_DELEGATION_DEPTH_EXCEEDED`.
- **Revoking the root revokes the branch.** There is no separate revocation for the child.

## Running it against real agents

[Use case 4 of the Travel Concierge demo](./travel-concierge.md) is the same mechanism with a UI in front of it: a Planner agent holding `read:catalog` + `write:orders` delegates only `read:catalog` to a Research agent, which can then search but not book.

## Related

- [Delegation & Sub-Delegation](../concepts/delegation.md) — what the verifier enforces along the chain
- [The Two-Issuer Model](../concepts/two-issuer-model.md) — why a consent grant is *not* part of this chain
