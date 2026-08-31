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
npm install @helixid/widget
```

HelixID ships the contract and the state machine, not the page. The SP owns presentation, because the SP owns the relationship with the user.

## Two entry points

The server module must **not** be bundled into the browser.

| Export | Entry point | Purpose |
| --- | --- | --- |
| `resolveConsentScopes(options)` | `@helixid/widget/server` | Resolves the SP's full grantable-scope catalog: curated fallback ∪ MCP `tools/list` scopes ∪ `accept-terms`. Takes no requested-scope or agent input. |
| `humanizeScope(scope)` | `@helixid/widget/server` | Last-resort label for a scope neither source describes (`book:flights` → "book flights"). |
| `createConsentController(props)` | `@helixid/widget` | Headless consent-selection state: scope checkboxes with required handling, durability choice, fetch/error state, `onAccept` / `onDecline`. |
| `DEFAULT_DURABILITY_OPTIONS` | `@helixid/widget` | The two durability choices offered by default. |

## Types

- **`ResolveConsentScopesOptions`** — optional `mcpServerUrl`, optional `curatedFallback` (SP-owned).
- **`HelixConsentWidgetProps`** — `agentDid`, `agentName`, `userIdentifier`, `serviceDid`, exactly one of `scopeOptions` / `scopesEndpoint`, plus optional `agentAvatarUrl`, `durabilityOptions`, `defaultDurability`, and `onAccept` / `onDecline`.
- **`ConsentSelection`** — `scopes`, `durability`.

## The scope-resolution contract

The SP owns the route itself, running under the consent page's own session auth:

```
GET <scopesEndpoint>?agentDid=<did>  →  { scopeOptions }
```

:::warning[`agentDid` must not change the catalog]
It is carried for **audit correlation only**. The grantable-scope catalog is a property of the service, not of who is asking — letting the requester influence it would let an agent enumerate or widen what it can be offered.
:::

Note that `resolveConsentScopes()` takes no requested-scope input either. It answers "what could a user grant here?", not "what did this agent ask for." The narrowing to what the user actually approved happens in the selection, and again at verification time via `effectiveScopes`.

## Durability

A grant can be one-off or **standing**. A standing grant means later calls from the same agent to the same service, for the same user, skip consent entirely — zero new grants and zero widget renders. That behaviour is asserted on in the [consent demo's](../examples/consent-demo.md) regression test, which counts prompts rather than just checking that the booking worked.

## Where the grant comes from

The widget collects the decision. **The service provider signs and issues the resulting `DelegationGrantCredential` itself**, with its own key, and hosts its own status list for revoking it. HelixID keeps no index mapping grants to services. See [The Two-Issuer Model](../concepts/two-issuer-model.md).
