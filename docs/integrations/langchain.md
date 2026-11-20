---
id: langchain
title: LangChain / LangGraph
sidebar_label: LangChain / LangGraph
sidebar_position: 1
description: Wire HelixID into a LangChain or LangGraph agent so every tool call carries a signed presentation.
---

# LangChain / LangGraph

The `@helixid/langchain` adapter does two things: it gets a signed presentation for every tool call the agent makes, and it hides tools the agent has no scope for.

```bash
npm install @helixid/langchain @helixid/sdk-js
```

The agent holds no key and no wallet. It needs a `HelixClient`, its own DID (from [onboarding](../sdk/sdk-js.md)) and the DID of the service each tool calls.

```typescript
import { HelixClient } from '@helixid/sdk-js';

const client = new HelixClient(process.env.HELIX_API_URL!, {
  adminApiKey: process.env.HELIX_ADMIN_API_KEY!,
});
const agentDid = process.env.AGENT_DID!;
```

## Attaching a presentation to tool calls

`HelixIDToolWrapper(tool, options)` wraps a structured tool. On every call it asks the HelixID API to sign a fresh presentation for the target service (`client.signVP()`), then runs the tool's own `_call` with the input unchanged. Inside the tool, `currentHelixVPHeaders()` returns the header to send on the outbound request.

```typescript
import { HelixIDToolWrapper, currentHelixVPHeaders } from '@helixid/langchain';

const lookupOrder = {
  name: 'lookup_order',
  description: 'Look up an order by id',
  metadata: { requiredScope: 'read:orders' },
  async _call(input: { orderId: string }) {
    const res = await fetch(`https://orders.example.com/orders/${input.orderId}`, {
      headers: { ...currentHelixVPHeaders() }, // { 'X-Helix-VP': <base64url VP> }
    });
    return res.text();
  },
};

const wrapped = HelixIDToolWrapper(lookupOrder, {
  client,
  agentDid,
  targetService: 'did:web:orders.example.com', // the service's DID
  userDid: 'did:web:user.example.com',         // optional: acting for this user
});
```

The wrapper returns a shallow copy of the tool with `_call` replaced (`{ ...tool, _call }`). Own properties such as `name`, `description` and `metadata` carry over; methods that live on a class prototype do not, so wrap a plain tool object, or check that the wrapped tool still has the methods your framework calls.

Three things follow from this design:

- **Signing is an API call.** Each tool call makes one request to the HelixID API, which holds the agent's key and picks the credentials. Nothing is signed in the agent process.
- **The presentation stays out of the tool input.** It is passed to the tool out of band, so it never appears in the arguments the model writes or reads. `currentHelixVPHeaders()` returns `{}` outside a wrapped call.
- **With `userDid`, consent is required.** The API attaches the consent grants the target service issued to this agent for that user. If there are none, signing fails with `CONSENT_GRANT_NOT_FOUND`: the user has not consented yet.

## Filtering tools by scope

```typescript
import { filterToolsByScope } from '@helixid/langchain';

const allowed = await filterToolsByScope(tools, client, agentDid);
```

This makes one API call, `client.listVCs({ subjectDid: agentDid, status: 'active' })`, and reads the scopes of the first active credential returned. A tool is kept if it has no `metadata.requiredScope`, or if its `requiredScope` or its name is among those scopes. If the agent has no active credential the function throws.

This is worth doing even though the verifier enforces scopes anyway. Filtering removes tools from the model's choices entirely, so it never proposes a call that is going to be refused — which saves a round trip and keeps the model from reasoning its way around a wall it cannot see.

:::note[Filtering is convenience; verification is enforcement]
`filterToolsByScope` runs in the agent's process and looks at one credential's scopes. It does not take consent grants into account, and it is not a security boundary. The service still verifies the presentation and enforces `effectiveScopes` on its own side — see [Authorization & Scopes](../concepts/authorization-and-scopes.md).
:::

## Marking a tool's required scope

```typescript
const refundOrder = new DynamicStructuredTool({
  name: 'refund_order',
  description: 'Refund an order in full',
  schema: refundOrderSchema,
  metadata: { requiredScope: 'write:orders' },
  func: async (input) => { /* ... */ },
});
```

Use the same scope string the verifying service checks. Scopes are compared as exact strings.

## The verifying side

The service receiving these calls reads the presentation with `readHelixVPHeader(req.headers)` and verifies it with `verifyVP(vp, client, { expectedTargetService })` from [`@helixid/sdk-js`](../sdk/sdk-js.md), or — if the tools are exposed over MCP — with [`helixidMCPMiddleware`](./mcp.md). Verification is a call to the HelixID API the service trusts.

## A runnable example

`examples/framework-middleware` in the `helixid` server repository runs the LangChain adapter against a live HelixID API.

```bash
pnpm example:middleware:setup
pnpm example:middleware:langchain
```

:::note[The example lags the published packages]
On `main`, that example still pins `@helixid/langchain` `^0.2.2` and `@helixid/sdk-js` `^0.4.0`, and its `langchain.ts` uses the removed `HelixIDMiddleware` and the `_helixVP` tool-input field. It shows the earlier API, not the one on this page. Treat this page as the reference for `@helixid/langchain` 0.4.0.
:::

See [Examples](../examples/overview.md#framework-middleware) for the full setup.
