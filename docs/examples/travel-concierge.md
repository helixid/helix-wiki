---
id: travel-concierge
title: "Demo B — LLM Agent with a Protected MCP Tool"
sidebar_label: "Demo B — Travel Concierge"
sidebar_position: 3
description: A real LLM agent is onboarded, receives a scoped credential, and calls a protected MCP booking tool — plus revocation and delegation.
---

# Demo B — LLM agent with a protected MCP tool

A real LLM travel agent is onboarded with HelixID, receives a scoped credential, and calls a protected MCP booking tool. The booking runs only after the MCP server has verified the agent's presentation against the live HelixID API and the HelixID MCP middleware has checked its scope.

This demo also covers **revocation** and **agent-to-agent delegation**.

:::note[Package versions in this demo]
The demo imports the middleware as `@helixid/mcp`, which its `package.json` aliases to `@helixid/mcp-middleware` `^0.1.4`, alongside `@helixid/sdk-js` `^0.4.0`. With those versions the agent passes the presentation as a `_helixVP` field in the tool arguments; current `@helixid/mcp-middleware` reads it from a header or MCP `_meta["x-helix-vp"]` instead. See the [version note](./overview.md) and [MCP Integration](../integrations/mcp.md) for the current API.
:::

## Step 1 — Get an LLM API key

The concierge uses a real LLM to decide when to call the booking tool. Obtain a key from Anthropic, OpenAI, Azure OpenAI, or Google AI Studio (Gemini):

- [Anthropic Console](https://console.anthropic.com/settings/keys)
- [OpenAI Platform](https://platform.openai.com/api-keys)

## Step 2 — Get the demo

```bash
git clone https://github.com/helixid/helixid.git
cd helixid/examples/e2e-travel-concierge
cp .env.example .env
```

Edit `.env` and add your provider and API key:

```bash
LLM_PROVIDER=anthropic # anthropic (default) | openai | azure | gemini
LLM_API_KEY=your-provider-key
```

`azure` also needs `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_DEPLOYMENT`. `LLM_MODEL` is an optional override that only the Gemini provider reads.

## Step 3 — Run it

```bash
docker compose up --build
```

This starts the real issuer API with SQLite in `did:key` mode, HelixID Console, a protected MCP server, the LLM agent, and the web chat. A one-shot `helixid-setup` service onboards the Concierge agent through `POST /v1/onboard`, writes its persona entry (DID and scopes, no credential and no key) to the manifest on the shared volume, prints `Seed complete`, and exits.

:::note[No wallet, no local keys]
The server generates each agent's keypair at onboarding and keeps the private key. Nothing in this demo creates a wallet or signs locally: every presentation is signed by the API through `POST /v1/agents/:did/vp` (`client.signVP()`). That route is admin-key gated in the open-source server, so the agent service holds `HELIX_ADMIN_API_KEY`. `.env.example` still carries a `WALLET_PASSPHRASE` line from the earlier design.
:::

:::note[Which database is the source of truth]
The HelixID SQLite database holds real agent trust state: onboarding, issued credentials (delegated ones included), scopes, revocation, status lists, and audit events. The Travel Concierge app's persona list is only local demo state used to show selectable agents in the chat UI — it is not the Console database and does not replace HelixID's records.
:::

| URL | What |
| --- | --- |
| **http://localhost:8090** | Travel Concierge chat — sign in `traveler` / `demo123` |
| **http://localhost:8080** | HelixID Console — sign in `admin` / `admin`, then open **Audit** |
| http://localhost:7100 | The protected MCP server |

A Python-agent variant, `e2e-travel-concierge-py`, is written to run the same flow on offset ports (chat 8091, Console 8082). See the [port table](./overview.md#where-each-demo-listens).

:::caution[This demo has no LLM fallback]
Unlike the [consent demo](./consent-demo.md), the concierge needs a working LLM and will surface the provider's error until it recovers. The free Google AI Studio tier returns `503 UNAVAILABLE` under load and rate-limits quickly — set `LLM_PROVIDER=anthropic` or `openai` for a steadier run.

To confirm the trust layer works with no LLM in the loop, use the [denial check](#confirming-the-tool-is-actually-protected) below.
:::

## Step 4 — The four guided use cases

The web chat has four tabs, each exercising a different trust decision against the same MCP server and the same `search_flights` / `book_flight` tools:

| Use case | Persona / credential state | What to try | Expected result |
| --- | --- | --- | --- |
| **1 — Full-access agent** | Concierge has `read:catalog` + `write:orders` | Book a flight | Booking succeeds |
| **2 — Read-only agent** | Runtime-onboarded agent has only `read:catalog` | Search, then book | Search succeeds; booking is refused for missing `write:orders` |
| **3 — Revoked credential** | Concierge's issued VC is revoked through the live API | Retry booking | VP is rejected because the status-list bit is revoked |
| **4 — Delegated agent** | Research starts with no tool scopes, then receives a child VC delegated from Planner with `read:catalog` | Search, then book | Delegated search succeeds; booking is refused because the child VC lacks `write:orders` |

### Use case 1 — Full-access agent

With **Concierge Agent** selected, type or click a suggestion:

> **Book flight BA249 for Ada Lovelace**

The LLM calls `book_flight`, the agent service asks the API to sign a fresh VP for the selected persona, and the MCP server verifies it and checks its `write:orders` scope before creating the booking. Refresh **Console → Audit** to see the onboarding and credential issuance events from setup and a fresh `VP_VERIFIED` event.

### Use case 2 — Read-only agent

The chat's **Open onboarding** panel takes a one-time enrollment token and a display name. The agent service redeems the token through `POST /v1/onboard`, adds only local persona metadata to the manifest, and the new agent appears in the persona selector — no restart.

:::caution[Where the token comes from]
The demo's README and chat UI say to generate this token in the Console. The current Console no longer shows one: its Enroll page mints a token and redeems it in the same click ("Onboard now"), and the demo pulls `helixid/console:latest`. Until the demo is updated, mint the token against the demo API directly — it is the same request the demo's own setup step makes:

```bash
curl -s http://localhost:3000/v1/enrollment-tokens \
  -H 'content-type: application/json' \
  -d '{"agentName":"Search Agent","requestedScopes":["read:catalog"],"requestedDomains":[],"maxDelegationDepth":0}'
```

Paste the `token` value from the response into the onboarding panel.
:::

Select the new agent and search (succeeds — it has `read:catalog`), then try to book (refused — it lacks `write:orders`). Its presentation still shows as `VP_VERIFIED` in the Console, because verification succeeded; the scope refusal is made by the middleware in the MCP server and appears in that server's logs and in the agent's reply.

### Use case 3 — Revoked credential

Select **Concierge Agent**, open the tab, and click **Revoke selected agent**. The agent service looks up the selected persona's active credential through the API and calls `POST /v1/vcs/:vcId/revoke` with the demo admin key. The browser never sees the VC, VP, or admin key.

Retry the same booking: the API still signs a fresh VP for that agent, but verification rejects it because the live status list now marks the credential revoked. This is the point of [status-list revocation](../concepts/revocation.md) — nothing was rotated, and the agent's other credentials are untouched.

Reset with `docker compose down -v` to issue a fresh Concierge credential.

### Use case 4 — Delegated agent

Click **Create demo agents**. The agent service onboards a Planner Agent (`read:catalog` + `write:orders`, `maxDelegationDepth: 1`) and a Research Agent with no tool scopes. Research's own credential carries an empty `privilegeScopes` array: it identifies the agent but authorizes nothing.

Click **Delegate read access**. The service calls `client.delegateAuthority()` — `POST /v1/agents/:did/delegate` — with Planner's credential as the source. The API holds Planner's key, signs a child credential for Research with only `read:catalog`, and records it. The demo then stores that credential's id as Research's `activeCredentialId` so its next presentation is signed with it.

Research can now search through the delegated credential, but booking is refused because that credential lacks `write:orders` — a child can never exceed its parent, and here it was deliberately given less. See [Delegation](../concepts/delegation.md).

:::note[Delegation is an API call]
The agent never signs a delegation itself. Scope-subset and depth checks happen on the server, and the delegatee must already be an onboarded agent. The route is admin-key gated in the open-source server.
:::

## Confirming the tool is actually protected

Call the MCP tool with no presentation at all:

```bash
curl -s http://localhost:7100/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"book_flight","arguments":{"flightId":"BA249","passengerName":"Mallory"}}}'
```

The tool result is an error: `Refused by HelixID: no verifiable presentation was supplied.`

## Reset

```bash
docker compose down -v
```

Source: [`examples/e2e-travel-concierge`](https://github.com/helixid/helixid/tree/main/examples/e2e-travel-concierge). A Python-agent variant is in [`e2e-travel-concierge-py`](https://github.com/helixid/helixid/tree/main/examples/e2e-travel-concierge-py); read the [caution about its unpinned SDK](./overview.md#how-the-demos-are-wired) first.
