---
id: langchain
title: "@helixid/langchain"
sidebar_label: "@helixid/langchain"
sidebar_position: 4
description: LangChain and LangGraph tool wrapper and scope-based tool filtering.
---

# `@helixid/langchain`

HelixID adapter for **LangChain and LangGraph**. It gets a fresh signed presentation for every tool call and hands it to the tool out of band, and it filters the tool list by the scopes the agent actually holds.

```bash
npm install @helixid/langchain @helixid/sdk-js
```

`@langchain/core` is declared as an **optional peer dependency**. This page describes `@helixid/langchain` 0.4.0.

## Exports

| Export | Purpose |
| --- | --- |
| `HelixIDToolWrapper(tool, options)` | Wraps a structured tool. Each `_call` first asks the HelixID API for a signed VP (`client.signVP()`), then runs the original `_call` with the input unchanged. |
| `currentHelixVPHeaders()` | Inside a wrapped tool call, returns `{ 'X-Helix-VP': <base64url VP> }` to send on the tool's outbound request. Returns `{}` outside a wrapped call. |
| `filterToolsByScope(tools, client, agentDid)` | Keeps the tools whose `metadata.requiredScope` (or whose name) is among the scopes of the agent's active credential. Tools with no `requiredScope` are kept. |
| `encodeBase64UrlJson(value)` | Encodes an object as base64url JSON. |

Types: `HelixIDToolWrapperOptions` (alias `LangChainMiddlewareOptions`), `StructuredToolLike`, `StructuredTool`.

## `HelixIDToolWrapperOptions`

| Option | Required | Purpose |
| --- | --- | --- |
| `client` | Yes | A `HelixClient`. Signing happens on the HelixID API, which holds the agent's key. |
| `agentDid` | Yes | The agent presenting. |
| `targetService` | Yes | The DID of the service the tool calls. Binds the VP to that one verifier. |
| `userDid` | No | The user on whose behalf the agent is acting. |

## Usage

```typescript
import { HelixClient } from '@helixid/sdk-js';
import { HelixIDToolWrapper, currentHelixVPHeaders } from '@helixid/langchain';

const client = new HelixClient(process.env.HELIX_API_URL!, {
  adminApiKey: process.env.HELIX_ADMIN_API_KEY!,
});

const lookupOrder = {
  name: 'lookup_order',
  async _call(input: { orderId: string }) {
    const res = await fetch(`https://orders.example.com/orders/${input.orderId}`, {
      headers: { ...currentHelixVPHeaders() },
    });
    return res.text();
  },
};

const wrapped = HelixIDToolWrapper(lookupOrder, {
  client,
  agentDid: process.env.AGENT_DID!,
  targetService: 'did:web:orders.example.com',
  userDid: 'did:web:user.example.com', // optional
});
```

Nothing is signed in the agent process and no wallet file is read. The VP never appears in the tool input, so it stays out of the model's arguments.

`filterToolsByScope()` is worth using alongside the wrapper: it keeps tools the agent has no scope for out of the model's choices entirely, so the model never proposes a call that is going to be refused. See [LangChain Integration](../integrations/langchain.md).

:::note[Removed in 0.4.0]
`HelixIDMiddleware` is gone; use `HelixIDToolWrapper`. `selectVC` and `ensureObjectInput` are no longer exported. The wrapper options no longer take `walletFilePath` or `walletPassphrase`, and `filterToolsByScope` takes `(tools, client, agentDid)` instead of a wallet path and passphrase. The VP is no longer injected into the tool input as `_helixVP`.
:::
