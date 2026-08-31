---
id: introduction
title: Introduction
sidebar_label: Introduction
sidebar_position: 1
slug: /
description: What HelixID is, the problem it solves, and how an agent proves what it is allowed to do.
---

# HelixID

**Cryptographic identity and authorization for AI agents.** Replace API keys with verifiable, scoped, and auditable agent identity.

HelixID is built on [W3C Verifiable Credentials 2.0](https://www.w3.org/TR/vc-data-model-2.0/) and [W3C DIDs 1.0](https://www.w3.org/TR/did-core/), and is Apache-2.0 licensed.

:::note[Positioning, stated precisely]
You will sometimes see HelixID described as "Auth0 for AI agents." That is shorthand for the category, not the whole pitch — HelixID is built on open standards, cryptographic verifiability, and decentralized trust. It is a trust primitive, not a SaaS wrapper.

It also does not replace OAuth. Use OAuth for sessions and simple internal APIs. Use HelixID for cross-org trust, delegation chains, and auditable credentials. See [Why not just use OAuth?](../comparisons/why-not-just-use.md).
:::

## The Problem

AI agents are authenticating with static API keys and bearer tokens — credentials designed for humans clicking through OAuth consent screens, not autonomous software making thousands of cross-boundary decisions per hour.

This breaks in predictable ways:

- **No delegation chain.** When Agent A spawns Agent B to call Service C, there's no standard way to prove B is authorized to act on A's behalf.
- **No scoped authority.** API keys are all-or-nothing. An agent that needs read access to one table gets the same key as one that needs admin access to everything.
- **No cross-org trust.** When your agent calls a third-party service, both sides rely on shared secrets and manual API key exchange. There's no way to verify authority without bilateral integration.
- **No revocation that works.** Revoking a compromised agent means rotating keys across every service it touched.
- **No audit trail.** "Who authorized this agent to do that?" is answered by grepping logs, not cryptographic proof.

HelixID fixes this by giving every AI agent a cryptographic identity — a portable, verifiable, revocable credential that works across organizational boundaries without requiring the parties to know each other in advance.

## How It Works

In one sentence: **an agent carries signed credentials proving what it may do, the service it calls verifies them locally before acting, and every decision is recorded.**

Two credentials matter, and they come from different parties:

1. **Agent-Authority VC** — issued once by the HelixID issuer when the agent is onboarded. This is the agent's *ceiling*: the most it could ever be allowed to do.
2. **Delegated Grant VC** — issued by the service provider after the **user** logs in and consents. This is what the user actually approved, for that one service.

Authority is the **intersection** of the two. A grant can never widen what the issuer gave the agent, and the agent can never act beyond what the user approved. Both credentials live in the agent's local wallet — private keys never leave the agent process.

This two-party split is the part most often flattened into a single issuer by mistake. It is covered in full in [The Two-Issuer Model](../concepts/two-issuer-model.md).

<Figure src="img/helixid-flow.svg" light width={1320} height={690} fullSrc="img/helixid-flow-full.svg" alt="HelixID flow. Setup: the HelixID issuer signs a one-time Agent-Authority VC that sets the scope ceiling, and the service provider signs a Delegated Grant VC after the user logs in and consents; both are stored in the agent wallet. Then, in sequence: 1, the agent requests a VP from its wallet; 2, the wallet returns a signed VP; 3, the agent makes its tool call with _helixVP attached; 4, the MCP server verifies signature, expiry, revocation and scopes in-process with no network hop, in about 1 to 6 milliseconds cached; 5, allow executes the tool, deny returns an error; 6, the agent SDK asynchronously logs VP_VERIFIED or VP_REJECTED to the HelixID audit log.">
  The whole trust chain in one pass — two issuers, a local signature, in-process verification, and an audit record either way.
</Figure>

Walking the diagram:

| Step | What happens |
| --- | --- |
| **1–2** | The agent asks its wallet for a Verifiable Presentation (VP). The wallet bundles the credentials and signs — locally, no network call. |
| **3** | The agent makes its normal tool call, with the signed VP attached. |
| **4** | The service verifies signature, expiry, revocation, and scopes **in-process** — it never calls the issuer to ask whether this particular request is allowed. |
| **5** | Allowed → the tool runs. Denied → an error, and the action never happens. |
| **6** | The outcome is written to the audit log either way — approvals *and* refusals. |

Step 4 is what makes this usable on a hot path and across organizations that have no prior integration with each other. It's also the claim most worth stating precisely — see [What "Offline Verification" Actually Means](../concepts/offline-verification.md).

## What HelixID Does

HelixID is a **5-layer trust stack** for AI agents, not just an identity library:

| Layer | What It Does | How |
| --- | --- | --- |
| **1. Identity** | Every agent gets a DID (Decentralized Identifier) bound to a cryptographic keypair | W3C DID (`did:web` default, `did:key` local, `did:hedera` optional) |
| **2. Authority** | Scoped, time-bound credentials that prove what an agent is allowed to do | W3C Verifiable Credentials with delegation chains |
| **3. Enforcement** | Runtime verification and authorization checks at execution boundaries | SDK/core verification + verifier-owned policy checks |
| **4. Audit** | Ordered record of the whole chain — issuance, consent, presentation, verification, authorization, action, result | Adapter-based `audit_log` store + structured stdout/file |
| **5. Revocation** | Decentralized revocation read as a static, cacheable document — no per-credential call to the issuer | Bitstring Status List |

Each layer is covered in [Core Concepts](../concepts/trust-stack.md).

## Roles

HelixID is built around three distinct actors. Each has a different relationship with the SDK and the issuer service.

| Role | Who | What they do |
| --- | --- | --- |
| **Platform Operator** | The team building the AI product | Creates issuer DID, mints bootstrap tokens, issues VCs to agents, manages revocation |
| **AI Agent** | The autonomous software process | Holds a wallet, signs VPs, presents credentials, delegates authority to sub-agents |
| **Service Provider** | The API or service the agent calls | Verifies incoming VPs, checks scopes, optionally issues a session JWT or caches the result |

### Platform Operator

The operator runs the issuer service (self-hosted `helix-api` or CLI for low volume). They never touch agent private keys — they only control the issuance policy.

```typescript
// Operator: mint a bootstrap token for a new agent (authenticated operator call)
// POST /v1/enrollment-tokens
// { agentName, requestedScopes, maxDelegationDepth, requestedDomains }
// → { bootstrapToken }

// Operator: revoke an agent's credential
// CLI
helix revoke --vc-id <vcId> --status-list ./public/status/1.json --wallet issuer.enc
```

The operator's private key (issuer signing key) never leaves the issuer service. It is the trust anchor for every VC issued in their trust domain.

### AI Agent

The agent holds a wallet containing its DID, keypair, and credentials. All signing operations are local — no private key ever leaves the agent process.

```typescript
import { AgentWallet, VPBuilder, delegate } from '@helixid/sdk-js'

// load wallet on every startup
const wallet = await AgentWallet.loadOrCreate('./wallet.enc', process.env.WALLET_PASSPHRASE!)

// build and sign a VP — fully local, no network
const vp = await new VPBuilder({
  credentials: [wallet.credentials[0]],   // add a consent grant VC as a second entry when one applies
  holderDid: wallet.getDID(),
  userDid: 'did:web:user.example.com',
  targetService: 'orders-service',
}).sign(wallet.getPrivateKeyHex(), `${wallet.getDID()}#key-1`)

// delegate to a sub-agent — fully local, self-signed (Option A)
const childVC = await delegate(
  { to: 'did:key:z6Mk...sub-agent', scopes: ['read:orders'], expiresIn: 3600 },
  wallet,
)
```

### Service Provider

The verifier never calls the issuer's API to authorize a request. `verifyVP()` computes signatures, expiry, delegation chain, and scopes from the presentation itself; the only outbound reads are static documents — the DID document (cached in-process) and, when the VC carries a `credentialStatus`, the status list.

```typescript
import { verifyVP, SessionManager } from '@helixid/sdk-js'

const result = await verifyVP(incomingVP, {
  expectedTargetService: 'orders-service',
})

// replay protection — verifier owns this store
const seen = await redis.get(`vpid:${result.vpId}`)
if (seen) throw new Error('REPLAY_DETECTED')
await redis.set(`vpid:${result.vpId}`, '1', 'EX', result.expiresInSeconds)

// scope check — effectiveScopes is the enforcement field: identical to
// privilegeScopes unless the VP carried a consent grant, in which case it is
// the intersection of the two
if (!result.effectiveScopes.includes('read:orders')) throw new Error('INSUFFICIENT_SCOPE')

// session handling — verifier's choice, both optional

// Option A: issue a short-lived JWT, agent reuses it for subsequent calls
const session = new SessionManager({ secret: process.env.JWT_SECRET!, ttl: 600 })
const token = await session.issue({ agentDid: result.agentDid, scopes: result.effectiveScopes })

// Option B: cache the VP result by vpId, skip re-verification on repeat calls
await cache.set(`vp:${result.vpId}`, result, { ttl: result.expiresInSeconds })
```

Neither session option is required. The verifier can re-verify the VP on every call if preferred. The SDK supports all three paths.

## Standards & Ecosystem Alignment

HelixID builds on established and converging standards:

- **W3C Verifiable Credentials 2.0** (Recommendation, May 2025) — credential format
- **W3C Decentralized Identifiers 1.0** (Recommendation) — identity layer
- **W3C StatusList2021** — decentralized revocation
- **W3C AI Agent Protocol Community Group** (est. June 2025) — cross-origin agent communication
- **DIF Trusted AI Agents Working Group** — industry alignment
- **NIST NCCoE** — AI Agent Identity and Authorization (concept paper, Feb 2026)

## Next Steps

- **[Quick Start](./quick-start.md)** — three ways in, all running locally
- **[The 5-Layer Trust Stack](../concepts/trust-stack.md)** — the concepts, in order
- **[SDK Reference](../sdk/sdk-js.md)** — every public surface

---

HelixID is built by [DgVerse](https://www.dgverse.in) — building the trust layer for digital credentials and AI agents.
