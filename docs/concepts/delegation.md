---
id: delegation
title: Delegation & Sub-Delegation
sidebar_label: Delegation & Sub-Delegation
sidebar_position: 5
description: How one agent grants a bounded subset of its authority to another, and what the verifier enforces along the chain.
---

# Delegation & Sub-Delegation

When Agent A spawns Agent B to do part of a job, B needs authority to act — and the service B calls needs to know that authority is real and bounded. That is the gap no API key can express: a key held by B says nothing about A having authorized it.

HelixID's answer: **Agent A issues a scoped, time-bound sub-delegation VC to Agent B.** B presents both its own identity credential and the delegation credential. The verifier validates the full chain. Trust is transitive but bounded — B cannot exceed A's permissions.

## Option A — the agent signs locally

Delegation is **agent-signed**, not issuer-signed:

```typescript
import { AgentWallet, delegate } from '@helixid/sdk-js';

const wallet = await AgentWallet.load('agent/wallet.enc', 'change-this-passphrase');

const delegatedCredential = await delegate(
  {
    to: 'did:key:z6Mk...delegatee',
    scopes: ['read:analytics'],
    expiresIn: 3600,
    // optional: fromVC: specific issuer-backed parent VC from wallet
  },
  wallet,
);

console.log(
  delegatedCredential.id,
  delegatedCredential.credentialSubject.privilegeScopes,
  delegatedCredential.credentialSubject.delegationDepth,
);
```

Agent A signs the child VC locally with its own key. Verifiers enforce chain integrity, scope subsetting, and max depth from the VC chain itself.

:::info[There is no API delegation endpoint]
Delegation is deliberately a local operation. Requiring an issuer round trip to delegate would put the issuer on the hot path of every agent-to-agent hand-off — precisely the coupling HelixID exists to remove.
:::

The parent (root) VC must still be **issuer-backed**. Self-issued VCs are only for the quick-start path and are never accepted as a trusted delegation root.

## What the verifier enforces

`verifyVP()` walks the entire chain and checks:

1. **Signature at every hop.** Each child was genuinely signed by the key its parent names.
2. **Scope subsetting.** A child's `privilegeScopes` must be a subset of its parent's. A delegation cannot introduce a scope the parent did not hold.
3. **Depth.** `delegationDepth` must not exceed the `maxDelegationDepth` set on the root credential.
4. **Expiry at every hop.** A child cannot outlive a link above it in the chain.
5. **Revocation of the root.** Revoking the issuer-backed root invalidates everything derived from it.

A broken parent breaks the chain: if *any* parent or intermediate VC is expired, revoked, missing, tampered with, invalidly signed, or incorrectly linked, the leaf VP fails verification. There is no partial credit for a chain that is valid up to the last hop.

Because all of this is computed from data inside the presentation, adding a hop costs a local signature verification rather than another issuer round trip. That is where HelixID's latency advantage over per-hop OAuth callbacks actually lives — see [Comparisons](../comparisons/why-not-just-use.md).

## Depth limits

`maxDelegationDepth` is set at issuance — by the operator when minting an enrollment token (`POST /v1/enrollment-tokens`), or with `--max-delegation-depth` on `helix vc issue`.

**Root agent VCs default to `maxDelegationDepth = 0`** — delegation is impossible unless the agent owner explicitly allows it. That default is deliberate: an agent that was never meant to spawn helpers cannot be talked into it.

Set the value explicitly on every credential you issue, and keep it small. Each child increments `delegationDepth`, and delegation fails once it would reach the maximum.

## Delegation and consent grants are different things

A [consent grant](./two-issuer-model.md) from a service provider is **not** part of the delegation chain. It is an independent credential presented alongside the agent VC, and it is never merged into `delegationChain`.

| | Sub-delegation | Consent grant |
| --- | --- | --- |
| Issued by | Another agent | The service provider |
| Approved by | The parent agent | The end user, interactively |
| Lives in | `delegationChain` | The wallet, as a separate credential |
| Revoked by | The platform issuer, via the root | The SP, via its own status list |

## Audit

VP verification events carry delegation context when it is available: `delegatedFrom`, `delegatedTo`, `parentVcId`, and `delegationDepth`. Rejections carry `attemptedVcId`, `attemptedParentVcId`, and `attemptedDelegatedFrom`, so a refused delegated call is as reconstructible as a successful one.

## Seeing it run

[Use case 4 of the Travel Concierge demo](../examples/travel-concierge.md) exercises this: a Planner agent holding `read:catalog` + `write:orders` delegates only `read:catalog` to a Research agent. Research can search through the delegated child credential, but booking is refused — the child VC never carried `write:orders`.

That path is enforced by the SDK and MCP verifier. The shipped API does not yet expose API-side delegation issuance, nor Console audit for local child-chain verification.

There is also a standalone script, [`examples/delegation-demo.ts`](../examples/delegation-chain.md).
