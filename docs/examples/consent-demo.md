---
id: consent-demo
title: "Demo A — User Consent Across Two Services"
sidebar_label: "Demo A — Consent"
sidebar_position: 2
description: A travel agent books a flight and a hotel from two independent service providers, each issuing its own consent grant.
---

# Demo A — user consent across two services

This is the [two-issuer model](../concepts/two-issuer-model.md) running. A travel agent books a flight and a hotel from **two independent service providers**, each with its own `did:web` identity, its own status list, and its own consent grant.

No LLM API key required — the agent falls back to a **scripted planner** if you don't set one, and the chat header switches to `Scripted planner` to show it has. That fallback also catches a rate-limited or unavailable provider mid-run, so this demo keeps working when the concierge demo can't. To use an LLM instead, set `LLM_PROVIDER` to `gemini`, `openai` or `anthropic` and `LLM_API_KEY` in `.env`; `LLM_MODEL` is optional.

:::note[How this demo issues grants]
The demo pins `@helixid/sdk-js` `^0.4.0`. Each service provider hosts its own `did:web` document and status list and signs the `DelegationGrantCredential` in its own process with `issueGrant()`. That function was removed in `@helixid/sdk-js` 0.6.0: with `@helixid/core` 3.0.0 a service is registered with HelixID and its backend calls `client.issueServiceDelegationGrant()`, and HelixID signs with the service key it holds. What the demo shows — one grant per service and user, issued in the service's name, reused on the next call — is the same in both. See the [version note](./overview.md).

The agent side is already the current model: the Travel Planner agent holds no key and no wallet, and each presentation is signed by the API through `client.signVP()`.
:::

```bash
git clone https://github.com/helixid/helixid.git
cd helixid/examples/e2e-consent-demo
cp .env.example .env
docker compose up --build
```

| URL | What |
| --- | --- |
| **http://localhost:4100** | Travel Planner chat — sign in `traveler` / `demo123` |
| **http://localhost:8080** | HelixID Console — sign in `admin` / `admin`, then open **Audit** |
| http://localhost:4101 | Airline SP (Helix Air) — consent page signs in as `ada` / `demo123` |
| http://localhost:4102 | Hotel SP (Helix Stay) — same sign-in |

A Python-agent variant, `e2e-consent-demo-py`, is written to run the same flow on offset ports (chat 4200, Console 8081) so it can run alongside this one. See the [port table](./overview.md#where-each-demo-listens).

:::warning[Allow popups for localhost]
The service provider opens its consent page in a **popup** and hands the signed grant back to the page that opened it. The demo needs popups allowed for `localhost`, and the chat tab left open — otherwise the flow stalls at step 3.
:::

## What to watch, in order

| Step | What happens | Why it matters |
| --- | --- | --- |
| 1 | Search for a flight | **No consent prompt** — search is read-only and carries no required scope |
| 2 | Try to book it | The airline refuses: it has never seen this agent, so it asks the **user** directly, on its own page |
| 3 | Approve the scopes | The airline signs a `DelegationGrantCredential`, scoped to exactly what was approved |
| 4 | Booking completes | The agent presents a VP carrying the grant; the airline verifies it with `verifyVP()` — a call to the HelixID API — and checks that a grant it issued is present and that the required scope is in `effectiveScopes` |
| 5 | Book a hotel | A **different** SP, so it asks again — nothing the airline approved carries over |
| 6 | Book a return flight | **No prompt this time** — the airline's standing grant is reused |

Steps 5 and 6 together are the per-`(service, user)` rule made visible: a grant is scoped to one service and one user, and a *standing* grant means repeat calls to that same service skip consent entirely.

Step 2 is the other half. The airline does not ask HelixID whether this agent may book — it asks **the user**, on its own page, because consent is the user's to give and the SP's to collect.

Each service provider requires a grant **it issued** in the presentation, not just the scope. Without a grant, `effectiveScopes` is the agent's own `privilegeScopes`, so an agent whose platform credential already carries `book:flights` would pass a bare scope check without the user ever being asked.

## The audit trail

Open **Console → Audit**. Every step above is there in order: credential issued, consent granted, credential presented, verification result, authorization result, action performed, and the booking reference it produced.

A refusal is recorded just as clearly as an approval — that's the point. An audit trail that only shows successes cannot answer "did anything try and fail?"

The service provider reports its own decisions (`VC_ISSUED`, `VC_PRESENTED`, `VP_VERIFIED`/`VP_REJECTED`, `AUTHZ_GRANTED`/`AUTHZ_DENIED`, `TOOL_INVOKED`) to the API's audit log; the API records `CONSENT_GRANTED` and the onboarding, DID and credential lifecycle events. Events from one user action share a `correlationId`. Emission is best-effort: an unreachable audit sink never fails a booking.

## The regression test

Step 6 is covered by an automated test that asserts on prompt **counts**, not just "the booking worked":

```bash
pnpm --filter @helixid/example-e2e-consent-demo test
```

Run it from the repository root after `pnpm install`. The test drives two real SP servers over HTTP with no LLM involved.

Counting prompts is the only way to catch a standing grant silently failing to apply — the booking would still succeed, just with an extra consent screen nobody noticed.

## Reset

```bash
docker compose down -v
```

Source and full walkthrough: [`examples/e2e-consent-demo`](https://github.com/helixid/helixid/tree/main/examples/e2e-consent-demo). A Python-agent variant of the same demo is in [`e2e-consent-demo-py`](https://github.com/helixid/helixid/tree/main/examples/e2e-consent-demo-py); read the [caution about its unpinned SDK](./overview.md#how-the-demos-are-wired) first.
