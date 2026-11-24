---
id: widget
title: "@helixid/widget"
sidebar_label: "@helixid/widget"
sidebar_position: 7
description: SP-side consent scope resolution and a headless consent controller.
---

# `@helixid/widget`

The HelixID consent widget — **SP-side scope resolution** and a **headless consent controller**. This is what a service provider uses to build the page where a user approves what an agent may do.

```bash
npm install @helixid/widget @helixid/sdk-js
```

HelixID ships the contract and the state machine, not the page. The SP owns presentation, because the SP owns the relationship with the user. This page describes `@helixid/widget` 0.3.1.

## Two entry points

The server module must **not** be bundled into the browser: it runs with the SP's HelixID API credentials.

| Export | Entry point | Purpose |
| --- | --- | --- |
| `resolveConsentScopes(options)` | `@helixid/widget/server` | Resolves what the consent screen may offer: the service's scopes that the agent itself holds, plus `accept-terms`. |
| `ACCEPT_TERMS_SCOPE` | `@helixid/widget/server` | The string `'accept-terms'`. |
| `ConsentNoGrantableScopesError`, `AgentScopesLookupError` | `@helixid/widget/server` | The two ways resolution fails. See [Errors](#errors-the-consent-screen-fails-closed). |
| `humanizeScope(scope)` | `@helixid/widget/server` | Last-resort label for a scope with an empty label (`book:flights` → `book flights`). |
| `createConsentController(props)` | `@helixid/widget` | Headless consent-selection state: scope checkboxes with required handling, durability choice, delegation choice, fetch/error state, `onAccept` / `onDecline`. |
| `DEFAULT_DURABILITY_OPTIONS` | `@helixid/widget` | The two durability choices offered by default. |

## Types

- **`ResolveConsentScopesOptions`** — `serviceDid`, `agentDid`, `serviceScopes` (`CuratedScopeEntry[]`), `client`.
- **`CuratedScopeEntry`** — `scope`, `label`, optional `description`, optional `required`.
- **`ScopeOption`** — `scope`, `label`, optional `description`, `defaultChecked`, `required`.
- **`AgentScopesSource`** — anything with `getAgentScopes({ serviceDid, agentDid })`. A `HelixClient` from `@helixid/sdk-js` satisfies it.
- **`HelixConsentWidgetProps`** — `agentDid`, `agentName`, `userIdentifier`, `serviceDid`, one of `scopeOptions` / `scopesEndpoint`, plus optional `agentAvatarUrl`, `offerDelegationChoice`, `durabilityOptions`, `defaultDurability`, and `onAccept` / `onDecline`.
- **`ConsentSelection`** — `scopes`, `durability`, and `allowDelegation` when the delegation choice was offered.

## Resolving scopes

```typescript
import { HelixClient } from '@helixid/sdk-js';
import { resolveConsentScopes } from '@helixid/widget/server';

const client = new HelixClient(process.env.HELIX_API_URL!, {
  adminApiKey: process.env.HELIX_ADMIN_API_KEY!,
});

const scopeOptions = await resolveConsentScopes({
  serviceDid,
  agentDid,
  serviceScopes: [
    { scope: 'book:flights', label: 'Book flights', description: 'Buy tickets on your behalf' },
    { scope: 'modify:booking', label: 'Modify bookings' },
  ],
  client,
});
```

The result is **the service's scopes that the agent holds as itself, plus `accept-terms`**:

1. The agent's own scopes are read with `client.getAgentScopes({ serviceDid, agentDid })`: the union of its active onboarding credentials. Credentials delegated to the agent do not count, so a consent given to this agent directly never rests on authority another agent can withdraw.
2. Each `serviceScopes` entry the agent holds is kept, in the service's order.
3. `accept-terms` is always appended, `required: true` and pre-checked. Accepting the terms is recorded as a grant scope, not a separate field.
4. An entry with an empty label gets `humanizeScope()`, so no scope is shown without one.

`serviceScopes` is the SP's own list: a curated catalog, the scopes on its MCP server's tools, or anything else. HelixID provides the mechanism, not the scope strings.

Grant issuance applies the same bound. `POST /v1/service-delegation-grants` refuses a scope outside the agent's own scopes (`CONSENT_GRANT_SCOPE_NOT_ALLOWED`) and a grant of nothing but `accept-terms` (`CONSENT_NO_GRANTABLE_SCOPES`), so what this function returns is what issuance will accept.

### Errors: the consent screen fails closed

| Error | `code` | Means |
| --- | --- | --- |
| `ConsentNoGrantableScopesError` | `CONSENT_NO_GRANTABLE_SCOPES` | The agent holds none of the service's scopes, so a consent here would grant nothing. |
| `AgentScopesLookupError` | `AGENT_SCOPES_LOOKUP_FAILED` | The agent's scopes could not be read (unknown agent, no active credential, API unreachable). `cause` holds the underlying error. |

Neither falls back to the service's full catalog, which would offer scopes that issuance then refuses.

## The scope-resolution contract

The SP owns the route itself, running under the consent page's own session auth:

```
GET <scopesEndpoint>?agentDid=<did>  →  { "scopeOptions": ScopeOption[] }
```

The controller appends `agentDid` to `scopesEndpoint` and fetches it at mount with same-origin credentials. Return a non-200 when resolution throws.

```typescript
// GET /api/consent/scopes?agentDid=<did>
export async function GET(request: Request) {
  const agentDid = new URL(request.url).searchParams.get('agentDid') ?? '';
  try {
    const scopeOptions = await resolveConsentScopes({
      serviceDid: SP_DID,
      agentDid,
      serviceScopes: SP_SCOPE_CATALOG,
      client,
    });
    return Response.json({ scopeOptions });
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'SCOPE_RESOLUTION_FAILED';
    const status = code === 'CONSENT_NO_GRANTABLE_SCOPES' ? 422 : 502;
    return Response.json({ error: { code, message: (error as Error).message } }, { status });
  }
}
```

:::note[`agentDid` now decides what is offered]
Earlier versions resolved one catalog for the whole service and carried `agentDid` for audit correlation only. Since 0.3.0 the list is narrowed to what this agent holds, because a grant cannot give an agent a scope its own credential lacks. The agent still cannot widen anything: it sees a subset of the service's catalog, and issuance enforces the same limit.
:::

`resolveConsentScopes()` takes no requested-scope input. It answers "what could a user grant this agent here?", not "what did this agent ask for." The narrowing to what the user actually approved happens in the selection, and again at verification time via `effectiveScopes`.

## The consent controller

```typescript
import { createConsentController } from '@helixid/widget';

const controller = createConsentController({
  agentDid, agentName, userIdentifier, serviceDid,
  scopesEndpoint: '/api/consent/scopes',   // or pre-resolved scopeOptions
  defaultDurability: 'standing',
  offerDelegationChoice: true,             // optional
  onAccept: async ({ scopes, durability, allowDelegation }) => { /* POST to your grant route */ },
  onDecline: () => { /* close the dialog */ },
});

await controller.load();
controller.subscribe((state) => render(state));
```

| Method | Purpose |
| --- | --- |
| `getState()` / `subscribe(listener)` | Read the state, or be told when it changes. `subscribe` returns an unsubscribe function. |
| `load()` | Fetch scopes from `scopesEndpoint`. A no-op when `scopeOptions` was given. |
| `toggleScope(scope)` | Check or uncheck an optional scope. Required scopes cannot be unchecked. |
| `setDurability(value)` | `'standing'` or `'session'`. |
| `setAllowDelegation(value)` | Set the delegation choice. A no-op unless `offerDelegationChoice` is `true`. |
| `accept()` / `decline()` | Call `onAccept` with the selection (only when `canAccept`), or `onDecline`. |

State: `status` (`loading`, `ready`, `error`), `scopeOptions`, `selectedScopes`, `durability`, `durabilityOptions`, `delegationChoiceOffered`, `allowDelegation`, `canAccept`, and `error` when there is one.

Behaviour:

- Provide **one** of `scopeOptions` (pre-resolved on the server) or `scopesEndpoint` (fetched at mount). If both are given, `scopeOptions` wins and nothing is fetched. If neither is given, the factory throws.
- `userIdentifier` must be the same form (DID or email) the grant records at consent time, or the user match fails later at verification.
- Required scopes (`accept-terms`) are in every `onAccept` payload. Optional scopes start checked unless the resolver set `defaultChecked: false`.
- If the `scopesEndpoint` request fails (non-200, malformed JSON, network failure), the controller enters `status: 'error'` with `canAccept: false`. Decline stays available. There is no retry.

## Durability

A grant is `session` (valid for 24 hours) or **`standing`** (the default: valid for about 10 years, or until revoked). A standing grant means later calls from the same agent to the same service, for the same user, skip consent entirely — zero new grants and zero widget renders. That behaviour is asserted on in the [consent demo's](../examples/consent-demo.md) regression test, which counts prompts rather than just checking that the booking worked.

`defaultDurability` pre-selects one option; it never hides the other.

## Delegation choice

With `offerDelegationChoice: true`, the controller exposes one more choice: whether the consent also covers agents this agent delegates to. It starts unchecked, is set with `setAllowDelegation()`, and `state.delegationChoiceOffered` says whether to render it. The selection then carries `allowDelegation`, `true` or `false`.

When the choice is not offered (the default), the selection has no `allowDelegation`, the grant is issued without the flag, and verifiers treat that as allowed. A grant with `allowDelegation: false` cannot be used by a sub-agent.

## Where the grant comes from

The widget collects the decision. The SP's own route then issues the grant by calling [`HelixClient.issueServiceDelegationGrant()`](./sdk-js.md) with the selection:

```typescript
const grant = await client.issueServiceDelegationGrant({
  serviceDid: SP_DID,
  agentDid,
  userDid: userIdentifier,
  scopes: selection.scopes,
  durability: selection.durability,
  ...(selection.allowDelegation !== undefined ? { allowDelegation: selection.allowDelegation } : {}),
});
```

The resulting `DelegationGrantCredential` is issued in the service's name. The service is enrolled with HelixID, which holds the service's key, signs the grant with it, records the grant's status entry and stores the grant; neither the browser nor the SP process sees a private key. Revoke a grant with `client.revokeVC(vcId)`. See [The Two-Issuer Model](../concepts/two-issuer-model.md).
