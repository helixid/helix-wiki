---
id: langchain
title: "@helixid/langchain"
sidebar_label: "@helixid/langchain"
sidebar_position: 4
description: LangChain and LangGraph middleware, tool wrappers, and scope-based tool filtering.
---

# `@helixid/langchain`

HelixID middleware for **LangChain and LangGraph** — injects a signed presentation into tool calls, and filters the tool list by the scopes the agent actually holds.

```bash
npm install @helixid/langchain
```

`@langchain/core` is declared as an **optional peer dependency**.

## Exports

| Export | Purpose |
| --- | --- |
| `HelixIDMiddleware(options)` | Returns a LangChain callback config that injects `_helixVP` into object tool input before tool start. |
| `HelixIDToolWrapper(tool, options)` | Wraps a structured tool and injects `_helixVP` before calling the original `_call`. |
| `filterToolsByScope(tools, client, agentDid)` | Filters tools by `tool.metadata.requiredScope` or tool name against the scopes of the agent's active VC. |
| `encodeBase64UrlJson(value)` | Encodes a VP or object as base64url JSON. |

## Options

| Option | Required | Purpose |
| --- | --- | --- |
| `client` | Yes | A `HelixClient`; VPs are signed server-side via `client.signVP()` |
| `agentDid` | Yes | The agent to sign for (returned by `onboardAgent()`) |
| `targetService` | Yes | Binds the VP to one verifier |
| `userDid` | No | The user on whose behalf the agent is acting |

## Usage

```typescript
import { HelixClient } from '@helixid/sdk-js';
import { HelixIDMiddleware } from '@helixid/langchain';

const client = new HelixClient(process.env.HELIX_API_URL!, { adminApiKey: process.env.HELIX_ADMIN_API_KEY! });

const middleware = HelixIDMiddleware({
  client,
  agentDid,
  userDid: 'did:web:user.example.com',
  targetService: 'orders',
});
```

`filterToolsByScope()` is worth using alongside the middleware: it keeps tools the agent has no scope for out of the model's choices entirely, so the model never proposes a call that is going to be refused. See [LangChain Integration](../integrations/langchain.md).
