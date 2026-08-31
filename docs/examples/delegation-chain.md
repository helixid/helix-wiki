---
id: delegation-chain
title: Delegation Chain
sidebar_label: Delegation Chain
sidebar_position: 4
description: A standalone script showing one agent sub-delegating a reduced credential to another.
---

# Delegation Chain

[`examples/delegation-demo.ts`](https://github.com/helixid/helixid/tree/main/examples/delegation-demo.ts) is the smallest complete picture of agent-to-agent delegation: one agent signs a reduced credential for another, and a verifier walks the resulting chain.

## The shape of it

```typescript
import { AgentWallet, delegate, VPBuilder, verifyVP } from '@helixid/sdk-js';

// Parent agent — holds an issuer-backed credential
const parent = await AgentWallet.load('agent/wallet.enc', process.env.WALLET_PASSPHRASE!);

// Child agent — has a DID, no authority yet
const child = await AgentWallet.create('./child-wallet.enc', 'child-passphrase');

// Parent signs a scoped-down child credential — locally, no API call
const childVC = await delegate(
  {
    to: child.getDID(),
    scopes: ['read:analytics'],   // must be a subset of the parent's scopes
    expiresIn: 3600,
  },
  parent,
);

await child.addCredential(childVC);

// The child presents its delegated credential
const vp = await new VPBuilder({
  credentials: [childVC],
  holderDid: child.getDID(),
  targetService: 'analytics-service',
}).sign(child.getPrivateKeyHex(), `${child.getDID()}#key-1`);

// The verifier walks the whole chain back to the issuer-backed root
const result = await verifyVP(vp, { expectedTargetService: 'analytics-service' });

console.log(result.valid, result.effectiveScopes);
```

## What to notice

- **`delegate()` never calls the API.** The parent signs with its own key. There is no delegation endpoint, by design — see [Design Decisions](../architecture/design-decisions.md).
- **The child's scopes must be a subset.** Asking for a scope the parent does not hold produces a credential the verifier rejects on chain validation.
- **The root must be issuer-backed.** A self-issued VC is never accepted as a delegation root, so this script needs a real enrolled parent credential.
- **`delegationDepth` increments, `maxDelegationDepth` bounds it.** A parent issued with `--max-delegation-depth 1` produces children that cannot delegate further.
- **Revoking the root revokes the branch.** There is no separate revocation for the child.

## Running it against real agents

[Use case 4 of the Travel Concierge demo](./travel-concierge.md) is the same mechanism with a UI in front of it: a Planner agent holding `read:catalog` + `write:orders` delegates only `read:catalog` to a Research agent, which can then search but not book.

## Related

- [Delegation & Sub-Delegation](../concepts/delegation.md) — what the verifier enforces along the chain
- [The Two-Issuer Model](../concepts/two-issuer-model.md) — why a consent grant is *not* part of this chain
