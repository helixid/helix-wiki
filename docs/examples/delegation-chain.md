---
id: delegation-chain
title: Delegation Chain
sidebar_label: Delegation Chain
sidebar_position: 4
description: A standalone script in which one agent delegates a reduced credential to another through the API.
---

# Delegation Chain

[`examples/delegation-demo.ts`](https://github.com/helixid/helixid/tree/main/examples/delegation-demo.ts) is the smallest complete picture of agent-to-agent delegation: one onboarded agent delegates a reduced set of scopes to another, and a second delegation attempt is refused.

There is no wallet, keypair or passphrase anywhere in it. Onboarding and delegation are both API calls: the server generates and holds each agent's key, and `client.delegateAuthority()` authorizes HelixID to sign the delegated credential on the delegator's behalf.

## Running it

It needs a running API and the admin key, because `POST /v1/agents/:did/delegate` is admin-key gated in the open-source server. There is no `pnpm example:*` script for it; from the repository root:

```bash
HELIX_API_URL=http://localhost:3000 \
HELIX_ADMIN_API_KEY=your-admin-key \
pnpm exec tsx examples/delegation-demo.ts
```

The script also loads the root `.env`, and falls back to `API_BASE_URL`, then `http://localhost:3000`.

## The shape of it

Condensed from the script:

```typescript
import {
  HelixClient,
  MaxDelegationDepthExceededError,
  ScopeEscalationDeniedError,
} from '@helixid/sdk-js';

const client = new HelixClient(helixApiUrl, { adminApiKey });

// Each agent: mint an enrollment token (POST /v1/enrollment-tokens), then redeem it.
// onboardAgent() returns { agentDid, vcId } — the server holds the key.
const delegator = await client.onboardAgent(delegatorToken, ['https://api.example.invalid']);
const subAgent = await client.onboardAgent(subAgentToken, ['https://api.example.invalid']);

// The delegator was onboarded with read:orders + write:orders and maxDelegationDepth 1.
// The sub-agent was onboarded with no scopes and maxDelegationDepth 0.
const delegatedVC = await client.delegateAuthority(
  delegator.agentDid,
  subAgent.agentDid,
  ['read:orders'],   // must be within the delegator's scopes
  3600,              // expiresIn, seconds
  { vcId: delegator.vcId },
);

// The sub-agent tries to delegate further. The API refuses.
try {
  await client.delegateAuthority(
    subAgent.agentDid,
    'did:key:z6MkSomeOtherAgentPlaceholder',
    ['read:orders'],
    3600,
  );
} catch (error) {
  if (error instanceof MaxDelegationDepthExceededError || error instanceof ScopeEscalationDeniedError) {
    console.log(`Expected failure: ${error.code}`);
  }
}
```

The script mints each enrollment token with a plain `fetch` to `POST /v1/enrollment-tokens`, passing `agentName`, `requestedScopes`, `requestedDomains` and `maxDelegationDepth`. Minting a token is not an SDK method.

## What to notice

- **Delegation is an API call.** `delegateAuthority()` posts to `POST /v1/agents/:did/delegate`. The agent never holds a key, so it cannot sign a delegation itself; scope-subset and depth checks run on the server.
- **The child's scopes must be a subset.** Asking for a scope the delegator does not hold is refused with `SCOPE_ESCALATION_DENIED`.
- **`vcId` picks the source credential.** It is optional; without it the server resolves the delegator's credential itself. Pass it once an agent holds more than one.
- **`delegationDepth` increments, `maxDelegationDepth` bounds it.** The delegated credential logs `delegationDepth: 1`, and the sub-agent has no depth left to delegate further.
- **The refusal code for an exhausted depth is not settled.** The script accepts either `MaxDelegationDepthExceededError` or `ScopeEscalationDeniedError` for the second attempt; its comments record that the API returned the scope error when this was last checked against a live server.
- **The delegatee is an onboarded agent.** The script onboards the sub-agent first, even with no scopes of its own. `@helixid/core` 3.0.0 requires this: the delegatee must be an agent the server onboarded that is still active.
- **The script stops at delegation.** It does not sign or verify a presentation with the delegated credential. Use case 4 of the Travel Concierge demo does.

The script pins `@helixid/sdk-js` `^0.4.0`, like the rest of the examples. `delegateAuthority()` takes the same positional arguments in 0.6.0, which adds a `revokeExisting` option. See the [version note](./overview.md).

## Running it against real agents

[Use case 4 of the Travel Concierge demo](./travel-concierge.md) is the same mechanism with a UI in front of it: a Planner agent holding `read:catalog` + `write:orders` delegates only `read:catalog` to a Research agent, which can then search but not book.

## Related

- [Delegation & Sub-Delegation](../concepts/delegation.md) — what the verifier enforces along the chain, and how delegated credentials are revoked
- [The Two-Issuer Model](../concepts/two-issuer-model.md) — why a consent grant is *not* part of this chain
