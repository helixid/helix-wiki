---
id: mcp
title: MCP (Model Context Protocol)
sidebar_label: MCP
sidebar_position: 2
description: Protect MCP tools with HelixID — verify presentations server-side and attach them client-side.
---

# MCP (Model Context Protocol)

MCP is where agent identity gets concrete: a tool call either runs or it doesn't. `@helixid/mcp` puts a verification step in front of the tool.

```bash
npm install @helixid/mcp
```

## The full picture

<Figure src="img/helixid-flow.svg" light width={1320} height={690} fullSrc="img/helixid-flow-full.svg" alt="HelixID flow. Setup: the HelixID issuer signs a one-time Agent-Authority VC that sets the scope ceiling, and the service provider signs a Delegated Grant VC after the user logs in and consents; both are stored in the agent wallet. Then, in sequence: 1, the agent requests a VP from its wallet; 2, the wallet returns a signed VP; 3, the agent makes its tool call with the VP in the X-Helix-VP header or MCP _meta['x-helix-vp'], never in the tool arguments; 4, the MCP server verifies signature, expiry, revocation and scopes in-process with no network hop, in about 1 to 6 milliseconds cached; 5, allow executes the tool, deny returns an error; 6, the agent SDK asynchronously logs VP_VERIFIED or VP_REJECTED to the HelixID audit log.">
  Steps 3 to 5 are what the two exports below do. <code>attachHelixVP</code> produces the call in step 3; <code>helixidMCPMiddleware</code> is step 4, and decides step 5.
</Figure>

## Protecting a tool (server side)

```typescript
import { helixidMCPMiddleware } from '@helixid/mcp';

const requireHelix = helixidMCPMiddleware({
  client,                        // HelixClient
  requiredScopes: ['read:orders'],
});

// in the tools/call handler:
await requireHelix({ name, input: args, _meta: request.params._meta, headers: req.headers });
```

The middleware reads the VP from the request's `params._meta["x-helix-vp"]` (any transport, including stdio) or, over HTTP, the `X-Helix-VP` header — never from the tool arguments. It verifies it and enforces the listed scopes. A call arriving without a valid presentation is refused **before the tool runs** — the action never happens, and the refusal is recorded.

| Option | Purpose |
| --- | --- |
| `client` | `HelixClient` used to verify the VP |
| `requiredScopes` | Scopes the caller must hold for the tool to run |
| `allowSelfSigned` | Accept self-issued credentials. Defaults to `false`. Development only. |

## Presenting a credential (client side)

```typescript
import { attachHelixVP } from '@helixid/mcp';

const call = await attachHelixVP(
  { name: 'orders.lookup', input: { orderId: 'ORD-1001' } },
  {
    client,                      // HelixClient
    agentDid: process.env.AGENT_DID!,
    userDid: 'did:web:user.example.com',
    targetService: 'orders',
  },
);

await mcpClient.callTool({ name: call.name!, arguments: call.input, _meta: call._meta });
```

A fresh VP is signed server-side (`client.signVP()`) on every call and set as `call._meta["x-helix-vp"]` (base64url JSON); `input` is left untouched. Pass `_meta` as the MCP request's `params._meta`.

## Seeing the denial path

The clearest way to confirm a tool is actually protected is to call it with no presentation at all:

```bash
curl -s http://localhost:7100/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"book_flight","arguments":{"flightId":"BA249","passengerName":"Mallory"}}}'
```

The protected tool refuses the booking because HelixID did not receive a valid presentation.

## Why MCP is a good fit

An MCP server frequently sits at an organizational boundary — the tools belong to one party, the agent to another. That is exactly the case where a bearer token is weakest: it proves possession of a secret and nothing about who authorized this agent to do this thing, and revoking it breaks every other caller holding the same key.

A presentation carries its own proof of delegated authority, is bound to one target service, expires in minutes, and can be revoked individually. See [Comparisons](../comparisons/why-not-just-use.md).

## Scope discovery for consent

An MCP server's `tools/list` doubles as a scope catalog: [`@helixid/widget`](../sdk/widget.md)'s `resolveConsentScopes()` unions the scopes it advertises with the SP's curated fallback to build the list a user sees on a consent page. Tools and consent scopes stay in sync without a second registry to maintain.

## A runnable example

`examples/framework-middleware` exercises the real MCP adapter against the live API:

```bash
pnpm example:middleware:setup
pnpm example:middleware:mcp
```

[Demo B — Travel Concierge](../examples/travel-concierge.md) is the full version: a real LLM agent calling a protected MCP booking tool, plus revocation and delegation.
