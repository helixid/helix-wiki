---
id: quick-start
title: Quick Start
sidebar_label: Quick Start
sidebar_position: 2
description: Four ways to run HelixID locally — the fastest path with a running API, the MCP quickstart, and two Docker demos.
---

# Quick Start

Four ways in, depending on what you want to see. All run locally.

| Path | Time | Needs | Best for |
| --- | --- | --- | --- |
| **[Fastest path](#fastest-path-one-running-api)** | 5 min | Node/Python + a running `helix-api` | Seeing the onboard → sign → verify cycle in code |
| **[MCP quickstart](./mcp-quickstart.md)** | 5 min | Node + pnpm | Putting an MCP server behind per-tool scopes, with no HelixID server needed to start |
| **[Consent demo](../examples/consent-demo.md)** | ~10 min | Docker | Watching a **user** grant consent and following the full audit trail — the best overview of what HelixID is for |
| **[Travel Concierge demo](../examples/travel-concierge.md)** | ~10 min | Docker + LLM key | A real LLM agent calling a protected MCP tool, plus revocation and delegation |

New here? Run the **[consent demo](../examples/consent-demo.md)** — it needs no API key and shows the whole identity → consent → verification → action → audit story end to end.

Both Docker demos are **self-contained**: clone this one repository, `cd` into the demo, and `docker compose up --build`. No second checkout, no pre-built sibling packages, no registry credentials.

:::warning[Run one demo at a time]
The two TypeScript demos share ports `3000` and `8080`. Ports, sign-ins and troubleshooting for all four — including the Python variants — are in [Examples](../examples/overview.md#where-each-demo-listens).
:::

## Fastest path (one running API)

No wallet file, no key material of your own. The API generates and holds each agent's private key, so trying this out is just standing up the API and calling it. Useful for testing the onboard/sign/verify flow locally, or if you already have a `helix-api` running some other way.

### Step 0 — Get a running `helix-api`

The only dependency here is Docker — no Postgres, no manual `.env`, no Prisma generation:

```bash
git clone https://github.com/helixid/helixid.git
cd helixid
docker compose -f docker-compose.local.yml up --build helix-api
```

Confirm it's up:

```bash
curl http://localhost:3000/health
```

### Step 1 — Install the SDK

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```bash
npm install @helixid/sdk-js
```

</TabItem>
<TabItem value="py" label="Python">

```bash
pip install helixid-sdk-py
```

</TabItem>
</Tabs>

### Step 2 — Onboard an agent and get it a credential

The server generates and holds the agent's key internally — nothing local, no passphrase:

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { HelixClient } from '@helixid/sdk-js'

const client = new HelixClient('http://localhost:3000', {
  adminApiKey: 'dev-admin-key-change-in-production', // matches docker-compose.local.yml
})

// Mint a one-use enrollment token (open endpoint, no auth needed)
const tokenRes = await fetch('http://localhost:3000/v1/enrollment-tokens', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ agentName: 'demo-agent', requestedScopes: ['read:orders'] }),
})
const { token } = await tokenRes.json()

const { agentDid, vcId } = await client.onboardAgent(token)

console.log(agentDid) // did:key:z6Mk...
```

</TabItem>
<TabItem value="py" label="Python">

```python
import requests
from helix_sdk import HelixClient

client = HelixClient(
    "http://localhost:3000",
    admin_api_key="dev-admin-key-change-in-production",  # matches docker-compose.local.yml
)

# Mint a one-use enrollment token (open endpoint, no auth needed)
token_res = requests.post(
    "http://localhost:3000/v1/enrollment-tokens",
    json={"agentName": "demo-agent", "requestedScopes": ["read:orders"]},
)
token = token_res.json()["token"]

result = client.onboard_agent(token)
agent_did = result["agentDid"]

print(agent_did)  # did:key:z6Mk...
```

</TabItem>
</Tabs>

### Step 3 — Sign and verify a VP

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { verifyVP } from '@helixid/sdk-js'

// The server signs on the agent's behalf -- it holds the only copy of the key
const serviceDid = 'did:web:orders.example.com' // the DID of the service being called
const vp = await client.signVP(agentDid, serviceDid)

const result = await verifyVP(vp, client, {
  expectedTargetService: serviceDid,
  allowSelfSigned: true, // dev only — remove in production
})

console.log(result.valid, result.agentDid, result.privilegeScopes)
// true  did:key:z6Mk...  ['read:orders']
```

</TabItem>
<TabItem value="py" label="Python">

```python
from helix_sdk import verify_vp

# The server signs on the agent's behalf -- it holds the only copy of the key
service_did = "did:web:orders.example.com"  # the DID of the service being called
vp = client.sign_vp(agent_did, service_did)

result = verify_vp(
    vp,
    client,
    expected_target_service=service_did,
    allow_self_signed=True,  # dev only — remove in production
)

print(result["valid"], result["agentDid"], result["privilegeScopes"])
# True  did:key:z6Mk...  ['read:orders']
```

</TabItem>
</Tabs>

That is the full round trip against a real, running issuer: the agent's DID is its passport, and the credential it received at onboarding is its base visa. The presentation names the target service by DID; a presentation signed for one service is rejected by another.

This path has the agent acting as itself. To act for a **user**, the service issues a consent grant first — see [The Two-Issuer Model](../concepts/two-issuer-model.md), or run the consent demo below.

## The two Docker demos

Both demos are documented in full under [Examples](../examples/overview.md):

- **[Demo A — user consent across two services](../examples/consent-demo.md)** — a travel agent books a flight and a hotel from two independent service providers, each with its own `did:web` identity and its own consent grant. No LLM API key required.
- **[Demo B — LLM agent with a protected MCP tool](../examples/travel-concierge.md)** — a real LLM travel agent enrolls with HelixID, receives a scoped credential, and calls a protected MCP booking tool. Also covers revocation and agent-to-agent delegation.

## Building your own integration

The demos run the full trust chain for you. If you're wiring HelixID into your own agent or service, start with [Installation & Modes](./installation-and-modes.md) for the API setup and enrollment flow, then:

- [Framework Integrations](../integrations/mcp.md) — MCP middleware, LangChain/LangGraph and CrewAI
- SDK Reference — [TypeScript](../sdk/sdk-js.md) and [Python](../sdk/sdk-py.md)
- [Self-Hosting & Deployment](../self-hosting/self-hosted-vs-cloud.md) — running the issuer yourself
