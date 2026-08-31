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
| `attachHelixVP(toolCall, options)` | Client-side helper that loads the wallet, signs a VP, and attaches `_helixVP` to the MCP tool input. |
| `helixidMCPMiddleware(options)` | Server-side middleware that requires `_helixVP`, verifies it, and enforces optional scopes. |

## Options

**`AttachHelixVPOptions`**

| Option | Required | Purpose |
| --- | --- | --- |
| `walletPassphrase` | Yes | Passphrase for the encrypted wallet file |
| `walletFilePath` | Yes | Path to the wallet |
| `targetService` | Yes | Binds the VP to one verifier |
| `userDid` | No | The user on whose behalf the agent is acting |

**`MCPMiddlewareOptions`**

| Option | Required | Purpose |
| --- | --- | --- |
| `requiredScopes` | No | Scopes the caller must hold for the tool to run |
| `allowSelfSigned` | No | Accept self-issued credentials. Defaults to `false`. Development only. |

## Usage

```typescript
import { attachHelixVP, helixidMCPMiddleware } from '@helixid/mcp';

const requireHelix = helixidMCPMiddleware({
  requiredScopes: ['read:orders'],
});

const outboundCall = await attachHelixVP(
  { name: 'orders.lookup', input: { orderId: 'ORD-1001' } },
  {
    walletPassphrase: process.env.WALLET_PASSPHRASE!,
    walletFilePath: './agent-wallet.enc',
    userDid: 'did:web:user.example.com',
    targetService: 'orders',
  },
);
```

A tool call arriving without a valid `_helixVP` is refused before the tool runs. See [MCP Integration](../integrations/mcp.md) for the full wiring, and [Demo B](../examples/travel-concierge.md) for it running against a real LLM agent.
