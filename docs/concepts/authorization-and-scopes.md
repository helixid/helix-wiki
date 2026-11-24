---
id: authorization-and-scopes
title: Authorization & Scopes
sidebar_label: Authorization & Scopes
sidebar_position: 6
description: What enforces authorization today — effectiveScopes, requireScope, replay protection — and where policy engines fit.
---

# Authorization & Scopes

Verification answers *"is this credential genuine and current?"* Authorization answers *"does it permit this particular call?"* HelixID separates them deliberately: `verifyVP()` does the first, and the service being called does the second, because only it knows its own rules.

:::note[Verified ≠ trusted]
Verification is necessary but not sufficient. A perfectly valid credential can still be the wrong credential for the action being attempted. Do not treat `result.valid === true` as authorization.
:::

## Enforce on `effectiveScopes`

Two scope lists appear on a verification result, and only one of them is the enforcement field:

| Field | What it is |
| --- | --- |
| `privilegeScopes` | The agent's ceiling — the union of every valid agent credential in the presentation |
| **`effectiveScopes`** | **The enforcement field.** Equal to `privilegeScopes` when the presentation carries no consent grant. With grants, it is the ceiling narrowed to what the user's consent covers |

```typescript
const result = await verifyVP(incomingVP, client, {
  expectedTargetService: serviceDid,
})

if (!result.effectiveScopes.includes('read:orders')) {
  throw new Error('INSUFFICIENT_SCOPE')
}
```

Enforcing on `privilegeScopes` when a consent grant is in play would grant the agent's ceiling rather than what the user actually approved. Always use `effectiveScopes`.

### How `effectiveScopes` is computed

- **No grant in the presentation** — the agent is acting as itself, and `effectiveScopes` is `privilegeScopes`.
- **A grant to the presenting agent** — its scopes are intersected with the agent's whole authority.
- **A grant to an agent further up the delegation chain** — its scopes are intersected only with the credentials delegated down from that agent. The presenting agent's own onboarding credential, presented alongside, does not widen what the parent's consent covers.
- **Several grants** — the results are combined.

A presentation that names a user (`userDid`) but carries no grant is rejected rather than falling back to the ceiling, so a `userDid` on a verified result always means a user who consented. The full rule set is in [The Two-Issuer Model](./two-issuer-model.md#rules-the-verifier-enforces).

## Scope helpers

The SDK provides two helpers over a verification result:

```typescript
import { checkScope, requireScope } from '@helixid/sdk-js'

checkScope(result, 'read:orders')    // → boolean
requireScope(result, 'write:orders') // → throws if missing
```

The framework adapters wrap the same idea:

- **MCP** — [`@helixid/mcp-middleware`](../integrations/mcp.md) maps each tool to the scopes it needs with `toolScopes` and refuses the call before the tool runs. A tool that is not in the map is denied by default.
- **LangChain / CrewAI** — `filterToolsByScope(tools, client, agentDid)` (and its Python counterparts) drops tools the agent's active credentials do not cover, so the model is never offered a tool it cannot use. See [LangChain](../integrations/langchain.md) and [CrewAI](../integrations/crewai.md).

## Scope vocabulary is the service's

HelixID does not impose a scope vocabulary or format. Scopes are plain strings — `read:orders`, `flights.book`, `orders:admin` — compared exactly, with no wildcards and no hierarchy. The limits are in [Verifiable Credentials](./verifiable-credentials.md#scopes).

The service owns its catalog, because only it knows what its tools do. On a consent page, [`@helixid/widget`](../sdk/widget.md) narrows that catalog to the scopes the agent itself holds and adds `accept-terms`; `humanizeScope()` is a last-resort label for a scope the catalog does not describe (`book:flights` → "book flights").

## Replay protection is yours

A presentation is **not single-use**. Neither `POST /v1/vp/verify` nor the SDK records which presentations have been accepted, so the same one verifies again until it expires. `verifyVP()` returns `vpId` and stops there; tracking what you have already accepted is the verifier's job, because it depends on your storage and your threat model:

```typescript
const ttl = Math.floor((new Date(incomingVP.expirationDate).getTime() - Date.now()) / 1000)
const seen = await redis.get(`vpid:${result.vpId}`)
if (seen) throw new Error('REPLAY_DETECTED')
await redis.set(`vpid:${result.vpId}`, '1', 'EX', ttl)
```

What limits a replayed presentation even without this: it is bound to one target service, it expires five minutes after signing, and revoking the credential behind it makes it fail. Treat a presentation like a short-lived bearer credential — send it only over TLS, and don't log it. Built-in single-use enforcement is on the [roadmap](../roadmap.md).

## Target-service binding

A presentation is bound to one verifier via `targetService`, the service's DID, and verification rejects a mismatch when you pass `expectedTargetService`. Always pass it. Without it, a presentation signed for one service would be accepted by another.

## Policy engines

<span className="helix-badge helix-badge--parked">Parked</span>

An Open Policy Agent (OPA) integration — Rego rules for scope, expiry, rate-limit, and ABAC checks decoupled from application code — is valid product scope but is **not shipped**. It is currently parked.

The reasoning: the core trust path is already enforced in code (VP signature, VC signature, expiry, revocation, target-service binding, delegation and consent constraints). OPA is a business-policy layer, not a crypto/trust layer, so it can wait until there are clearer service-owner policy requirements. Adding it now would introduce sidecar operations, policy authoring, deployment docs, and failure-mode design before they are needed.

The constraints already agreed for when it does land:

- OPA must run **only after** HelixID's cryptographic verification succeeds.
- It must **never replace** signature, expiry, revocation, DID resolution, or delegation-chain checks.
- Policy inputs must be structured and schema-validated.
- `OPA_ENABLED=false` must cleanly bypass policy checks for local and self-hosted development.

Until then, business rules live in your own verifier code, immediately after `verifyVP()` succeeds. See the [Roadmap](../roadmap.md).
