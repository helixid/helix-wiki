---
id: langchain
title: LangChain / LangGraph
sidebar_label: LangChain / LangGraph
sidebar_position: 1
description: Wire HelixID into a LangChain or LangGraph agent so every tool call carries a signed presentation.
---

# LangChain / LangGraph

The `@helixid/langchain` adapter does two things: it attaches a signed presentation to every tool call the agent makes, and it hides tools the agent has no scope for.

```bash
npm install @helixid/langchain
```

## Attaching a presentation to tool calls

`HelixIDMiddleware` returns a LangChain callback config that injects `_helixVP` into object tool input before the tool starts.

```typescript
import { HelixIDMiddleware } from '@helixid/langchain';

const middleware = HelixIDMiddleware({
  walletPassphrase: process.env.WALLET_PASSPHRASE!,
  walletFilePath: './agent-wallet.enc',
  userDid: 'did:web:user.example.com',
  targetService: 'orders',
});
```

The VP is signed locally from the wallet on each call — no network round trip, and the private key never leaves the process. `selectVC()` picks the credential matching `targetService`, falling back to the first VC in the wallet.

For a single tool rather than a whole run, `HelixIDToolWrapper(tool, options)` wraps a structured tool and injects `_helixVP` before calling the original `_call`.

## Filtering tools by scope

```typescript
import { filterToolsByScope } from '@helixid/langchain';

const allowed = await filterToolsByScope(
  tools,
  './agent-wallet.enc',
  process.env.WALLET_PASSPHRASE!,
);
```

Tools are matched by `tool.metadata.requiredScope`, falling back to the tool name, against the scopes in the wallet's credential.

This is worth doing even though the verifier enforces scopes anyway. Filtering removes tools from the model's choices entirely, so it never proposes a call that is going to be refused — which saves a round trip and keeps the model from reasoning its way around a wall it cannot see.

:::note[Filtering is convenience; verification is enforcement]
`filterToolsByScope` reads the agent's own wallet, so it reflects what the agent *believes* it holds. It is a client-side affordance, not a security boundary. The service still verifies the presentation and enforces scopes on its own side — see [Authorization & Scopes](../concepts/authorization-and-scopes.md).
:::

## Marking a tool's required scope

```typescript
const bookFlight = new DynamicStructuredTool({
  name: 'book_flight',
  description: 'Book a flight for a passenger',
  schema: bookFlightSchema,
  metadata: { requiredScope: 'write:orders' },
  func: async (input) => { /* ... */ },
});
```

Use the same scope string the verifying service checks.

## The verifying side

The service receiving these calls verifies the presentation with `verifyVP()` from `@helixid/sdk-js`, or — if the tools are exposed over MCP — with [`helixidMCPMiddleware`](./mcp.md).

## A runnable example

`examples/framework-middleware` demonstrates the real LangChain adapter against the live HelixID API, with no mocking: it creates a real agent DID during onboarding, stores an encrypted wallet, signs VPs locally, and verifies them through the API.

```bash
pnpm example:middleware:setup
pnpm example:middleware:langchain
```

See [Examples](../examples/overview.md#framework-middleware) for the full setup.
