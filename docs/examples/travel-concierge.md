---
id: travel-concierge
title: "Demo B — LLM Agent with a Protected MCP Tool"
sidebar_label: "Demo B — Travel Concierge"
sidebar_position: 3
description: A real LLM agent enrolls, receives a scoped credential, and calls a protected MCP booking tool — plus revocation and delegation.
---

# Demo B — LLM agent with a protected MCP tool

A real LLM travel agent enrolls with HelixID, receives a scoped credential, and calls a protected MCP booking tool. The booking runs only after `@helixid/mcp` verifies the agent's presentation against the live HelixID API.

This demo also covers **revocation** and **agent-to-agent delegation**.

## Step 1 — Get an LLM API key

The concierge uses a real LLM to decide when to call the booking tool. Obtain a key from Anthropic, OpenAI, or Azure OpenAI:

- [Anthropic Console](https://console.anthropic.com/settings/keys)
- [OpenAI Platform](https://platform.openai.com/api-keys)

## Step 2 — Get the demo

```bash
git clone https://github.com/helixid/helixid.git
cd helixid
cd examples/e2e-travel-concierge
cp .env.example .env
```

Edit `.env` and add your provider and API key:

```bash
LLM_PROVIDER=anthropic # anthropic (default) | openai | azure
LLM_API_KEY=your-provider-key
```

## Step 3 — Run it

```bash
docker compose up --build
```

This starts the real issuer API with SQLite and local `did:key` identities, HelixID Console, a protected MCP server, the LLM agent, and the web chat. A one-shot setup service enrolls one agent, issues its credential, saves its encrypted wallet to the shared volume, and exits.

:::note[Which database is the source of truth]
The Console/HelixID SQLite database holds real agent trust state: enrollment, issued credentials, scopes, revocation, status lists, and audit events. The Travel Concierge app's persona list is only local demo state used to show selectable agents in the chat UI — it is not the Console database and does not replace HelixID's records.
:::

| URL | What |
| --- | --- |
| **http://localhost:8090** | Travel Concierge chat |
| **http://localhost:8080** | HelixID Console — sign in `admin` / `admin`, then open **Audit** |

## Step 4 — The four guided use cases

The web chat has four tabs, each exercising a different trust decision against the same MCP server and the same `search_flights` / `book_flight` tools:

| Use case | Persona / credential state | What to try | Expected result |
| --- | --- | --- | --- |
| **1 — Full-access agent** | Concierge has `read:catalog` + `write:orders` | Book a flight | Booking succeeds |
| **2 — Read-only agent** | Runtime-onboarded agent has only `read:catalog` | Search, then book | Search succeeds; booking is refused for missing `write:orders` |
| **3 — Revoked credential** | Concierge's issued VC is revoked through the live API | Retry booking | VP is rejected because the status-list bit is revoked |
| **4 — Delegated agent** | Research starts with no tool scopes, then receives a Planner-signed child VC with `read:catalog` | Search, then book | Delegated search succeeds; booking is refused because the child VC lacks `write:orders` |

### Use case 1 — Full-access agent

With **Concierge Agent** selected, type or click a suggestion:

> **Book flight BA249 for Ada Lovelace**

The LLM calls `book_flight`, the agent signs a fresh VP locally, and the MCP server verifies the credential and its `write:orders` scope before creating the booking. Refresh **Console → Audit** to see the enrollment, credential issuance, and successful `VP_VERIFIED` event.

### Use case 2 — Read-only agent

Generate an onboard token in Console, then click **Onboard new agent** in the Travel Concierge chat and paste the token. The agent service consumes the token, creates a local encrypted wallet, adds only local persona metadata to the manifest, and the new agent appears in the persona selector — no restart.

Select it and search (succeeds — it has `read:catalog`), then try to book (refused — it lacks `write:orders`).

### Use case 3 — Revoked credential

Select **Concierge Agent**, open the tab, and click **Revoke selected agent**. The agent service loads the selected persona's wallet server-side, reads the credential id, and calls `POST /v1/vcs/:vcId/revoke` with the demo admin key. The browser never sees the wallet, VC, VP, private key, or admin key.

Retry the same booking: the wallet still signs a valid VP, but HelixID rejects it because the live status list now marks the credential revoked. This is the point of [status-list revocation](../concepts/revocation.md) — nothing was rotated, and the agent's other credentials are untouched.

Reset with `docker compose down -v` to issue a fresh Concierge credential.

### Use case 4 — Delegated agent

Create the demo Planner Agent (`read:catalog` + `write:orders`, delegation depth 1) and Research Agent (`read:catalog`), then delegate only `read:catalog` from Planner to Research.

Research can search through the delegated child credential, but booking is refused because that delegated credential lacks `write:orders` — a child can never exceed its parent, and here it was deliberately given less. See [Delegation](../concepts/delegation.md).

:::caution[What is enforced where]
This path is enforced by the SDK and MCP verifier. The shipped API does **not** yet expose API-side delegation issuance, nor Console audit for local child-chain verification.
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

The protected tool refuses the booking because HelixID did not receive a valid presentation.

## Reset

```bash
docker compose down -v
```

Source: [`examples/e2e-travel-concierge`](https://github.com/helixid/helixid/tree/main/examples/e2e-travel-concierge).
