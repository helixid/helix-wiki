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
| `attachHelixVP(toolCall, options)` | Client-side helper that requests a server-signed VP (`client.signVP()`) and attaches `_helixVP` to the MCP tool input. |
| `helixidMCPMiddleware(options)` | Server-side middleware that requires `_helixVP`, verifies it, and enforces optional scopes. |

## Options

**`AttachHelixVPOptions`**

| Option | Required | Purpose |
| --- | --- | --- |
| `client` | Yes | A `HelixClient`; VPs are signed server-side via `client.signVP()` |
| `agentDid` | Yes | The agent to sign for (returned by `onboardAgent()`) |
| `targetService` | Yes | Binds the VP to one verifier |
| `userDid` | No | The user on whose behalf the agent is acting |

**`MCPMiddlewareOptions`**

| Option | Required | Purpose |
| --- | --- | --- |
| `client` | Yes | A `HelixClient`; verification calls `POST /v1/vp/verify` |
| `requiredScopes` | No | Scopes the caller must hold for the tool to run |
| `allowSelfSigned` | No | Accept credentials whose issuer is their own subject. Defaults to `false`. Development only. |

## Usage

```typescript
import { HelixClient } from '@helixid/sdk-js';
import { attachHelixVP, helixidMCPMiddleware } from '@helixid/mcp';

const client = new HelixClient(process.env.HELIX_API_URL!, { adminApiKey: process.env.HELIX_ADMIN_API_KEY! });

const requireHelix = helixidMCPMiddleware({
  client,
  requiredScopes: ['read:orders'],
});

const outboundCall = await attachHelixVP(
  { name: 'orders.lookup', input: { orderId: 'ORD-1001' } },
  {
    client,
    agentDid,
    userDid: 'did:web:user.example.com',
    targetService: 'orders',
  },
);
```

A tool call arriving without a valid `_helixVP` is refused before the tool runs. See [MCP Integration](../integrations/mcp.md) for the full wiring, and [Demo B](../examples/travel-concierge.md) for it running against a real LLM agent.
