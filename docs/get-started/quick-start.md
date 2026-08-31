---
id: quick-start
title: Quick Start
sidebar_label: Quick Start
sidebar_position: 2
description: Three ways to run HelixID locally — a five-minute SDK path and two Docker demos.
---

# Quick Start

Three ways in, depending on what you want to see. All run locally.

| Path | Time | Needs | Best for |
| --- | --- | --- | --- |
| **[5-minute path](#5-minute-path-no-infrastructure)** | 5 min | Node only | Seeing the VP build/verify cycle in code, no infra at all |
| **[Consent demo](../examples/consent-demo.md)** | ~10 min | Docker | Watching a **user** grant consent and following the full audit trail — the best overview of what HelixID is for |
| **[Travel Concierge demo](../examples/travel-concierge.md)** | ~10 min | Docker + LLM key | A real LLM agent calling a protected MCP tool, plus revocation and delegation |

New here? Run the **[consent demo](../examples/consent-demo.md)** — it needs no API key and shows the whole identity → consent → verification → action → audit story end to end.

## 5-minute path (no infrastructure)

No Postgres, no Redis, no Hedera account, no running API. Works immediately after install — useful for testing the VP/verification flow locally, or if you already have a VC issued by a self-hosted issuer or any other means.

### Step 1 — Install the SDK

```bash
npm install @helixid/sdk-js
```

### Step 2 — Generate an agent identity and load or self-issue a dev credential

```typescript
import { AgentWallet, selfIssueVC } from '@helixid/sdk-js'

const wallet = await AgentWallet.create('./wallet.enc', 'dev-passphrase');


// If you already have a VC issued by a self-hosted issuer, CLI, or any other
// spec-compliant source, load it directly:
await wallet.addCredential(existingVC)

// Quick-start only: self-issue a credential for local development.
// Self-issued VCs carry no issuer-attested authority and are not valid for
// production, demos that prove trust, revocation, or delegation. Verifiers
// reject them by default because allowSelfSigned defaults to false.
const vc = await selfIssueVC(
  { scopes: ['read:orders'], expiresIn: 3600 },
  wallet,
)
await wallet.addCredential(vc)

console.log(wallet.getDID()) // did:key:z6Mk...
```

:::warning[Self-issued credentials are development-only]
A self-issued VC carries no issuer-attested authority. It is not valid for production, nor for demos that are meant to prove trust, revocation, or delegation. Verifiers reject them by default — `allowSelfSigned` defaults to `false`, and a self-issued VC is never accepted as a trusted delegation root.
:::

### Step 3 — Build, present, and verify a VP (fully local)

```typescript
import { VPBuilder, verifyVP } from '@helixid/sdk-js'

const vp = await new VPBuilder({
  credentials: [wallet.credentials[0]],   // add a consent grant VC as a second entry when one applies
  holderDid: wallet.getDID(),
  userDid: 'did:web:user.example.com',
  targetService: 'orders-service',
}).sign(wallet.getPrivateKeyHex(), `${wallet.getDID()}#key-1`)

const result = await verifyVP(vp, {
  expectedTargetService: 'orders-service',
  allowSelfSigned: true,  // dev only — remove in production
})

console.log(result.valid, result.agentDid, result.privilegeScopes)
// true  did:key:z6Mk...  ['read:orders']
```

Full round trip for local development only. No issuer, no API call, no Hedera. For any valid HelixID scenario, swap `selfIssueVC` for a real bootstrap token enrollment so the root VC is signed by the trusted issuer.

## The two Docker demos

Both demos are documented in full under [Examples](../examples/overview.md):

- **[Demo A — user consent across two services](../examples/consent-demo.md)** — a travel agent books a flight and a hotel from two independent service providers, each with its own `did:web` identity, its own status list, and its own consent grant. No LLM API key required.
- **[Demo B — LLM agent with a protected MCP tool](../examples/travel-concierge.md)** — a real LLM travel agent enrolls with HelixID, receives a scoped credential, and calls a protected MCP booking tool. Also covers revocation and agent-to-agent delegation.

## Building your own integration

The demos run the full trust chain for you. If you're wiring HelixID into your own agent or service, start with [Installation & Modes](./installation-and-modes.md) for the API setup and enrollment flow, then:

- [Framework Integrations](../integrations/langchain.md) — LangChain/LangGraph and MCP middleware
- [SDK Reference](../sdk/sdk-js.md) — every public surface
- [Self-Hosting & Deployment](../self-hosting/self-hosted-vs-cloud.md) — running the issuer yourself
