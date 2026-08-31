---
id: authorization-and-scopes
title: Authorization & Scopes
sidebar_label: Authorization & Scopes
sidebar_position: 6
description: What enforces authorization today — effectiveScopes, requireScope, replay protection — and where policy engines fit.
---

# Authorization & Scopes

Verification answers *"is this credential genuine and current?"* Authorization answers *"does it permit this particular call?"* HelixID separates them deliberately: `verifyVP()` does the first, and the verifier does the second, because only the verifier knows its own rules.

:::note[Verified ≠ trusted]
Verification is necessary but not sufficient. A perfectly valid credential can still be the wrong credential for the action being attempted. Do not treat `result.valid === true` as authorization.
:::

## Enforce on `effectiveScopes`

Three scope values appear on a verification result, and only one of them is the enforcement field:

| Field | What it is |
| --- | --- |
| `privilegeScopes` | The agent credential's ceiling |
| (the grant's scopes) | What the user approved at this service |
| **`effectiveScopes`** | **The enforcement field** — identical to `privilegeScopes` unless the VP carried a consent grant, in which case it is the intersection of the two |

```typescript
const result = await verifyVP(incomingVP, {
  expectedTargetService: 'orders-service',
})

if (!result.effectiveScopes.includes('read:orders')) {
  throw new Error('INSUFFICIENT_SCOPE')
}
```

Enforcing on `privilegeScopes` when a consent grant is in play would grant the agent's ceiling rather than what the user actually approved. Always use `effectiveScopes`.

## Scope helpers

The SDK provides two helpers over a `VerifyVPResult`:

```typescript
import { checkScope, requireScope } from '@helixid/sdk-js'

checkScope(result, 'read:orders')    // → boolean
requireScope(result, 'write:orders') // → throws if missing
```

The framework adapters wrap the same idea:

- **MCP** — `helixidMCPMiddleware({ requiredScopes: ['read:orders'] })` enforces on the server side before a tool runs.
- **LangChain** — `filterToolsByScope(tools, walletFilePath, walletPassphrase)` filters a tool list by `tool.metadata.requiredScope` or tool name against the wallet's VC scopes, so the model is never offered a tool it cannot use.

## Scope vocabulary is the service provider's

HelixID does not impose a scope vocabulary. Scopes are plain strings, conventionally `verb:resource` — `read:orders`, `write:orders`, `read:catalog`, `book:flights`.

The service provider owns its catalog, because only it knows what its tools do. [`@helixid/widget`](../sdk/widget.md) resolves that catalog from a curated fallback union the MCP server's `tools/list` scopes, plus `accept-terms`; `humanizeScope()` is a last-resort label for a scope neither source describes (`book:flights` → "book flights").

## Replay protection is yours

`verifyVP()` returns `vpId` and stops there. Tracking which presentations you have already accepted is the verifier's job, because it depends on your storage and your threat model:

```typescript
const seen = await redis.get(`vpid:${result.vpId}`)
if (seen) throw new Error('REPLAY_DETECTED')
await redis.set(`vpid:${result.vpId}`, '1', 'EX', result.expiresInSeconds)
```

`POST /v1/vp/verify` handles replay tracking for you. If you self-verify and skip it, you are vulnerable to replay attacks. The VP's own short expiry (`VP_TTL_SECONDS`, default 300s) bounds the window but does not close it.

## Target-service binding

A VP is bound to one verifier via `targetService`, and `verifyVP()` rejects a mismatch when you pass `expectedTargetService`. Always pass it. Without it, a presentation captured by one service could be replayed against another.

## Policy engines

<span className="helix-badge helix-badge--parked">Parked</span>

An Open Policy Agent (OPA) integration — Rego rules for scope, expiry, rate-limit, and ABAC checks decoupled from application code — is valid product scope but is **not shipped**. It is currently parked.

The reasoning, recorded in the repo's parked-items log: the core trust path is already enforced in code (VP signature, VC signature, expiry, revocation, `vpId` replay protection, delegation constraints). OPA is a business-policy layer, not a crypto/trust layer, so it can wait until there are clearer service-owner policy requirements. Adding it now would introduce sidecar operations, policy authoring, deployment docs, and failure-mode design before they are needed.

The constraints already agreed for when it does land:

- OPA must run **only after** HelixID's cryptographic verification succeeds.
- It must **never replace** signature, expiry, revocation, replay, DID resolution, or delegation-chain checks.
- Policy inputs must be structured and schema-validated.
- `OPA_ENABLED=false` must cleanly bypass policy checks for local and self-hosted development.

Until then, business rules live in your own verifier code, immediately after `verifyVP()` succeeds. See the [Roadmap](../roadmap.md).
