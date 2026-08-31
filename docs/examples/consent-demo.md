---
id: consent-demo
title: "Demo A — User Consent Across Two Services"
sidebar_label: "Demo A — Consent"
sidebar_position: 2
description: A travel agent books a flight and a hotel from two independent service providers, each issuing its own consent grant.
---

# Demo A — user consent across two services

This is the [two-issuer model](../concepts/two-issuer-model.md) running. A travel agent books a flight and a hotel from **two independent service providers**, each with its own `did:web` identity, its own status list, and its own consent grant.

No LLM API key required — the agent falls back to a scripted planner if you don't set one.

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
| http://localhost:4101 | Airline SP (Helix Air) |
| http://localhost:4102 | Hotel SP (Helix Stay) |

## What to watch, in order

| Step | What happens | Why it matters |
| --- | --- | --- |
| 1 | Search for a flight | **No consent prompt** — search is read-only and carries no required scope |
| 2 | Try to book it | The airline refuses: it has never seen this agent, so it asks the **user** directly, on its own page |
| 3 | Approve the scopes | The airline signs a Delegated Grant VC, scoped to exactly what was approved |
| 4 | Booking completes | The agent presents a VP; the airline checks issuer trust, validity, and scope before acting |
| 5 | Book a hotel | A **different** SP, so it asks again — nothing the airline approved carries over |
| 6 | Book a return flight | **No prompt this time** — the airline's standing grant is reused |

Steps 5 and 6 together are the per-`(service, user)` rule made visible: a grant is scoped to one service and one user, and a *standing* grant means repeat calls to that same service skip consent entirely.

Step 2 is the other half. The airline does not ask HelixID whether this agent may book — it asks **the user**, on its own page, because consent is the user's to give and the SP's to collect.

## The audit trail

Open **Console → Audit**. Every step above is there in order: credential issued, consent granted, credential presented, verification result, authorization result, action performed, and the booking reference it produced.

A refusal is recorded just as clearly as an approval — that's the point. An audit trail that only shows successes cannot answer "did anything try and fail?"

## The regression test

Step 6 is covered by an automated test that asserts on prompt **counts**, not just "the booking worked":

```bash
pnpm --filter @helixid/example-e2e-consent-demo test
```

Counting prompts is the only way to catch a standing grant silently failing to apply — the booking would still succeed, just with an extra consent screen nobody noticed.

## Reset

```bash
docker compose down -v
```

Full walkthrough: [`examples/e2e-consent-demo`](https://github.com/helixid/helixid/tree/main/examples/e2e-consent-demo).
