---
id: langchain
title: "@helixid/langchain"
sidebar_label: "@helixid/langchain"
sidebar_position: 4
description: LangChain and LangGraph tool wrapper, per-call VP signing, and scope-based tool filtering.
---

# `@helixid/langchain`

HelixID adapter for **LangChain and LangGraph** — signs a fresh presentation for every tool call (sent as the `X-Helix-VP` header, never in tool arguments), and filters the tool list by the scopes the agent actually holds.

```bash
npm install @helixid/langchain
```

`@langchain/core` is declared as an **optional peer dependency**.

## Exports

| Export | Purpose |
| --- | --- |
| `HelixIDToolWrapper(tool, options)` | Wraps a structured tool so each call signs a fresh VP; tool input is passed through unchanged. |
| `currentHelixVPHeaders()` | Inside a wrapped call, returns `{ 'X-Helix-VP': <base64url VP> }` for the tool's outbound request; empty outside one. |
| `filterToolsByScope(tools, client, agentDid)` | Filters tools by `tool.metadata.requiredScope` or tool name against the scopes of the agent's active VC. |
| `encodeBase64UrlJson(value)` | Encodes a VP or object as base64url JSON. |

## Options

`HelixIDToolWrapperOptions` (alias `LangChainMiddlewareOptions`):

| Option | Required | Purpose |
| --- | --- | --- |
| `client` | Yes | `HelixClient` that signs the VP (`client.signVP()`) |
| `agentDid` | Yes | The agent's DID |
| `targetService` | Yes | Binds the VP to one verifier |
| `userDid` | No | The user on whose behalf the agent is acting |

## Usage

```typescript
import { HelixIDToolWrapper, currentHelixVPHeaders } from '@helixid/langchain';

const wrapped = HelixIDToolWrapper(orderTool, {
  client,
  agentDid: process.env.AGENT_DID!,
  targetService: 'orders',
  userDid: 'did:web:user.example.com',
});

// inside orderTool's _call:
await fetch(url, { headers: { ...currentHelixVPHeaders() } });
```

`filterToolsByScope()` is worth using alongside the wrapper: it keeps tools the agent has no scope for out of the model's choices entirely, so the model never proposes a call that is going to be refused. See [LangChain Integration](../integrations/langchain.md).
