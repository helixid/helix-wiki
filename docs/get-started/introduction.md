---
id: introduction
title: Introduction
sidebar_label: Introduction
sidebar_position: 1
slug: /
description: What HelixID is, the problem it solves, and how an agent proves what it is allowed to do.
---

# HelixID

**Passports and visas for AI agents.** Verifiable identity and authorization, so any service can check who an agent is and what it is allowed to do — without calling the agent's issuer to ask.

HelixID replaces shared API keys with scoped, revocable, auditable credentials. It is built on [W3C Verifiable Credentials 2.0](https://www.w3.org/TR/vc-data-model-2.0/) and [W3C DIDs 1.0](https://www.w3.org/TR/did-core/), and is Apache-2.0 licensed.

:::note[Positioning, stated precisely]
HelixID does not replace OAuth or your identity provider. Inside one organization they work well: use them. HelixID is for the moment an agent crosses into a service owned by someone else — cross-organization trust, delegation chains, and credentials a third party can audit. See [Why not just use OAuth?](../comparisons/why-not-just-use.md).

It is a trust primitive built on open standards, not a SaaS wrapper. Everything described in these docs is open source and self-hostable.
:::

## The Problem

AI agents are authenticating with static API keys and bearer tokens — credentials designed for humans clicking through OAuth consent screens, not autonomous software making thousands of cross-boundary decisions per hour.

This breaks in predictable ways:

- **No delegation chain.** When Agent A spawns Agent B to call Service C, there's no standard way to prove B is authorized to act on A's behalf.
- **No scoped authority.** API keys are all-or-nothing. An agent that needs read access to one table gets the same key as one that needs admin access to everything.
- **No cross-org trust.** When your agent calls a third-party service, both sides rely on shared secrets and manual API key exchange. There's no way to verify authority without bilateral integration.
- **No revocation that works.** Revoking a compromised agent means rotating keys across every service it touched.
- **No audit trail.** "Who authorized this agent to do that?" is answered by grepping logs, not cryptographic proof.

A static key is a badge: it opens doors in one building, and it cannot say which agent is holding it, who allowed it, or what it is meant to do. HelixID gives every agent a passport instead — a portable, verifiable, revocable identity that works across organizational boundaries without the two sides building an integration first.

## How It Works

In one sentence: **an agent carries signed credentials proving who it is and what it may do, the service it calls verifies them before acting, and every decision is recorded.**

| | What it is | Issued by | Says |
| --- | --- | --- | --- |
| **Passport** | The agent's DID | Created at onboarding | Who the agent is, and which domain vouches for it |
| **Base visa** | `HelixAgentCredential` | The HelixID issuer that onboarded the agent | The agent's *ceiling*: the most it could ever be allowed to do |
| **Service visa** | `DelegationGrantCredential` | The service, after the **user** consents on the service's own page | What the user approved, for that one service |

A service visa can never widen the base visa, and the agent can never act for a user beyond what that user approved. HelixID holds the agent's key in custody and signs on its behalf, so the agent never handles key material itself.

This two-party split is the part most often flattened into a single issuer by mistake. It is covered in full in [The Two-Issuer Model](../concepts/two-issuer-model.md).

<Figure src="img/helixid-flow.svg" light width={1320} height={690} fullSrc="img/helixid-flow-full.svg" alt="HelixID flow. Setup: the HelixID issuer signs a one-time agent credential that sets the scope ceiling, and the service issues a grant after the user logs in and consents. Then, in sequence: the agent requests a signed presentation; the agent makes its tool call with the presentation attached; the service verifies signature, expiry, revocation and scopes; allow executes the tool, deny returns an error; the outcome is written to the audit log.">
  The whole trust chain in one pass — two issuers, a signed presentation, verification before the tool runs, and an audit record either way. The diagram predates server-side signing and verification; the table below is the current flow.
</Figure>

| Step | What happens |
| --- | --- |
| **1. Passport** | The operator onboards the agent. HelixID creates its DID, holds its key, and issues the base visa. |
| **2. Consent** | When the agent is to act for a user, the user approves it on the service's own consent page. |
| **3. Visa** | The service issues a signed, scoped grant for that agent and that user. |
| **4. Present** | Before a call, the agent asks HelixID for a Verifiable Presentation (VP) for that service. It is signed with the agent's key, bound to that one service, and valid for five minutes. |
| **5. Check** | The service verifies the presentation — signatures, expiry, revocation, delegation chain, consent — and checks the scope the call needs. The agent's issuer is never asked whether this particular request is allowed. |
| **6. Act and record** | Allowed → the tool runs. Denied → an error, and the action never happens. Either way it is written to the audit log. |

Step 5 is what makes this work across organizations that have no prior integration with each other. It is also the claim most worth stating precisely — see [What "Offline Verification" Actually Means](../concepts/offline-verification.md).

**Revocation** flips one bit in the issuer's status list. The credential stops verifying everywhere, mid-task, and nothing else has to be rotated.

## What HelixID Does

HelixID is a **5-layer trust stack** for AI agents, not just an identity library:

| Layer | What It Does | How |
| --- | --- | --- |
| **1. Identity** | Every agent gets a DID (Decentralized Identifier) bound to a cryptographic keypair | W3C DID (`did:web` default, `did:key` local, `did:hedera` optional) |
| **2. Authority** | Scoped, time-bound credentials that prove what an agent is allowed to do | W3C Verifiable Credentials with delegation chains |
| **3. Enforcement** | Runtime verification and authorization checks at execution boundaries | API verification + verifier-owned scope checks, MCP middleware |
| **4. Audit** | Ordered record of the whole chain — issuance, consent, presentation, verification, authorization, action, result | Adapter-based `audit_log` store + structured stdout/file |
| **5. Revocation** | Revocation read as a static, cacheable document — no per-credential call to the issuer | W3C Bitstring Status List |

Each layer is covered in [Core Concepts](../concepts/trust-stack.md).

## Roles

HelixID is built around three distinct actors. Each has a different relationship with the SDK and the issuer service.

| Role | Who | What they do |
| --- | --- | --- |
| **Platform Operator** | The team building the AI product | Runs the HelixID server, mints enrollment tokens, onboards agents, manages revocation |
| **AI Agent** | The autonomous software process | Requests VPs from HelixID, presents credentials, delegates authority to sub-agents |
| **Service Provider** | The API or MCP server the agent calls | Verifies incoming VPs, checks scopes, issues consent grants for its users, optionally issues a session JWT |

### Platform Operator

The operator runs the HelixID server. It holds agent keys in custody and signs on their behalf, so the operator controls both issuance policy and the admin key that authorizes signing — see [Security model](../security/security-model.md).

```bash
# Operator: mint an enrollment token for a new agent
curl -X POST "$HELIX_API_URL/v1/enrollment-tokens" \
  -H 'content-type: application/json' \
  -d '{ "agentName": "travel-booker", "requestedScopes": ["flights.search", "flights.book"], "maxDelegationDepth": 0 }'
# → { "token": "..." }

# Operator: revoke a credential
curl -X POST "$HELIX_API_URL/v1/vcs/<vcId>/revoke" -H "x-admin-api-key: $HELIX_ADMIN_API_KEY"
```

The operator's private key (issuer signing key) never leaves the issuer service. It is the trust anchor for every VC issued in their trust domain.

### AI Agent

The agent has no wallet and no private key of its own — the API holds the only copy, generated when the agent was onboarded, and signs on the agent's behalf.

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { HelixClient, verifyVP } from '@helixid/sdk-js'

const client = new HelixClient('http://localhost:3000', {
  adminApiKey: 'dev-admin-key-change-in-production',
})

// the server signs on the agent's behalf -- it holds the only copy of the key
const serviceDid = 'did:web:orders.example.com' // the service being called
const vp = await client.signVP(agentDid, serviceDid)

const result = await verifyVP(vp, client, { expectedTargetService: serviceDid })
console.log(result.valid, result.agentDid, result.privilegeScopes)

// delegate to a sub-agent — also an API call, same trust boundary as signVP
// the sub-agent must itself be onboarded on this server
const childVC = await client.delegateAuthority(agentDid, subAgentDid, ['read:orders'], 3600)
```

</TabItem>
<TabItem value="py" label="Python">

```python
from helix_sdk import HelixClient, verify_vp

client = HelixClient(
    "http://localhost:3000",
    admin_api_key="dev-admin-key-change-in-production",
)

# the server signs on the agent's behalf -- it holds the only copy of the key
service_did = "did:web:orders.example.com"  # the service being called
vp = client.sign_vp(agent_did, service_did)

result = verify_vp(vp, client, expected_target_service=service_did)
print(result["valid"], result["agentDid"], result["privilegeScopes"])

# delegate to a sub-agent — also an API call, same trust boundary as sign_vp
# the sub-agent must itself be onboarded on this server
child_vc = client.delegate_authority(agent_did, sub_agent_did, ["read:orders"], 3600)
```

</TabItem>
</Tabs>

### Service Provider

`verifyVP()` is an API call to `POST /v1/vp/verify` on the HelixID API the service verifies with — signature check, delegation-chain walk, expiry, target service, consent rules and revocation all happen there, with `VP_VERIFIED`/`VP_REJECTED` audit logging too. What the service does itself is enforce the result, guard against replay, and manage its own session or cache.

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { verifyVP, SessionManager, HelixClient } from '@helixid/sdk-js'

const client = new HelixClient(process.env.HELIX_API_URL!)

const result = await verifyVP(incomingVP, client, {
  expectedTargetService: process.env.SERVICE_DID!, // this service's own DID
})

// replay protection — verifier owns this store; the VP's own expiry bounds the TTL
const ttl = Math.floor((new Date(incomingVP.expirationDate).getTime() - Date.now()) / 1000)
const seen = await redis.get(`vpid:${result.vpId}`)
if (seen) throw new Error('REPLAY_DETECTED')
await redis.set(`vpid:${result.vpId}`, '1', 'EX', ttl)

// scope check — effectiveScopes is the enforcement field: identical to
// privilegeScopes unless the VP carried a consent grant, in which case it is
// the intersection of the two
if (!result.effectiveScopes.includes('read:orders')) throw new Error('INSUFFICIENT_SCOPE')

// session handling — verifier's choice, both optional

// Option A: issue a short-lived JWT, agent reuses it for subsequent calls
const session = new SessionManager({ secret: process.env.JWT_SECRET!, ttl: 600 })
const token = await session.issue({ agentDid: result.agentDid, scopes: result.effectiveScopes })

// Option B: cache the VP result by vpId, skip re-verification on repeat calls
await cache.set(`vp:${result.vpId}`, result, { ttl })
```

</TabItem>
<TabItem value="py" label="Python">

```python
import os
from datetime import datetime, timezone
from helix_sdk import verify_vp, SessionManager, HelixClient

client = HelixClient(os.environ["HELIX_API_URL"])

result = verify_vp(incoming_vp, client, expected_target_service=os.environ["SERVICE_DID"])

# replay protection — verifier owns this store; the VP's own expiry bounds the TTL
expires_at = datetime.fromisoformat(incoming_vp["expirationDate"].replace("Z", "+00:00"))
ttl = int((expires_at - datetime.now(timezone.utc)).total_seconds())
seen = redis.get(f"vpid:{result['vpId']}")
if seen:
    raise Exception("REPLAY_DETECTED")
redis.set(f"vpid:{result['vpId']}", "1", ex=ttl)

# scope check — effectiveScopes is the enforcement field: identical to
# privilegeScopes unless the VP carried a consent grant, in which case it is
# the intersection of the two
if "read:orders" not in result["effectiveScopes"]:
    raise Exception("INSUFFICIENT_SCOPE")

# session handling — verifier's choice, both optional

# Option A: issue a short-lived JWT, agent reuses it for subsequent calls
session = SessionManager(secret=os.environ["JWT_SECRET"], ttl=600)
token = session.issue(result["agentDid"], result["effectiveScopes"])

# Option B: cache the VP result by vpId, skip re-verification on repeat calls
cache.set(f"vp:{result['vpId']}", result, ttl)
```

</TabItem>
</Tabs>

Neither session option is required. The verifier can re-verify the VP on every call if preferred.

For MCP servers, [`@helixid/mcp-middleware`](../integrations/mcp.md) does all of this in front of every tool call — and accepts standard OAuth bearer tokens on the same server, so existing clients keep working.

## Standards & Ecosystem Alignment

HelixID builds on established and converging standards:

- **W3C Verifiable Credentials 2.0** (Recommendation, May 2025) — credential format
- **W3C Decentralized Identifiers 1.0** (Recommendation) — identity layer
- **W3C Bitstring Status List** — revocation
- **W3C AI Agent Protocol Community Group** (est. June 2025) — cross-origin agent communication
- **DIF Trusted AI Agents Working Group** — industry alignment
- **NIST NCCoE** — AI Agent Identity and Authorization (concept paper, Feb 2026)

## Next Steps

- **[Quick Start](./quick-start.md)** — four ways in, all running locally
- **[MCP Quickstart](./mcp-quickstart.md)** — protect an MCP server's tools in five minutes
- **[The 5-Layer Trust Stack](../concepts/trust-stack.md)** — the concepts, in order
- **SDK Reference** — [TypeScript](../sdk/sdk-js.md) and [Python](../sdk/sdk-py.md)
