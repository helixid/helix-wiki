---
id: mcp
title: "@helixid/mcp"
sidebar_label: "@helixid/mcp"
sidebar_position: 3
description: MCP client helper and server middleware — attachHelixVP and helixidMCPMiddleware.
---

# `@helixid/mcp`

HelixID middleware for **Model Context Protocol** servers — inbound presentation verification — and a client-side helper for attaching a presentation to an outbound tool call.

```bash
npm install @helixid/mcp
```

`@modelcontextprotocol/sdk` is declared as an **optional peer dependency**, so installing HelixID does not force an MCP dependency on projects that do not use it.

## Exports

| Export | Purpose |
| --- | --- |
| `attachHelixVP(toolCall, options)` | Client-side helper that requests a server-signed VP (`client.signVP()`) and sets `toolCall._meta["x-helix-vp"]` (base64url JSON), leaving `input` untouched. Pass `_meta` as the MCP request's `params._meta`. |
| `helixidMCPMiddleware(options)` | Server-side middleware that reads the VP from `toolCall._meta["x-helix-vp"]` or, over HTTP, `toolCall.headers` (`X-Helix-VP`) — never from `input` — verifies it, and enforces optional scopes. |

`MCPToolCall` carries `name`, `input`, `_meta` (the request's `params._meta`) and `headers` (HTTP request headers, when served over HTTP).

## Options

**`AttachHelixVPOptions`**

| Option | Required | Purpose |
| --- | --- | --- |
| `client` | Yes | `HelixClient` that signs the VP |
| `agentDid` | Yes | The agent's DID |
| `targetService` | Yes | Binds the VP to one verifier |
| `userDid` | No | The user on whose behalf the agent is acting |

**`MCPMiddlewareOptions`**

| Option | Required | Purpose |
| --- | --- | --- |
| `client` | Yes | `HelixClient` used to verify the VP |
| `requiredScopes` | No | Scopes the caller must hold for the tool to run |
| `allowSelfSigned` | No | Accept self-issued credentials. Defaults to `false`. Development only. |

## Usage

```typescript
import { attachHelixVP, helixidMCPMiddleware } from '@helixid/mcp';

// client side
const call = await attachHelixVP(
  { name: 'orders.lookup', input: { orderId: 'ORD-1001' } },
  {
    client,
    agentDid: process.env.AGENT_DID!,
    userDid: 'did:web:user.example.com',
    targetService: 'orders',
  },
);
await mcpClient.callTool({ name: call.name!, arguments: call.input, _meta: call._meta });

// server side
const requireHelix = helixidMCPMiddleware({ client, requiredScopes: ['read:orders'] });
await requireHelix({ name, input: args, _meta: request.params._meta, headers: req.headers });
```

A tool call arriving without a valid VP in `_meta["x-helix-vp"]` or the `X-Helix-VP` header is refused before the tool runs. See [MCP Integration](../integrations/mcp.md) for the full wiring, and [Demo B](../examples/travel-concierge.md) for it running against a real LLM agent.
