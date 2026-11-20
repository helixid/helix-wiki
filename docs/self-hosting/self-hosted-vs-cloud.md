---
id: self-hosted-vs-cloud
title: Self-Hosted vs Cloud
sidebar_label: Self-Hosted vs Cloud
sidebar_position: 1
description: What the open-source stack covers today, and what a managed offering would add.
---

# Self-Hosted vs Cloud

**HelixID is fully self-hostable today.** Everything in these docs runs on infrastructure you control, under Apache 2.0, and nothing in the open-source stack requires an account with anyone.

## What the open-source stack covers

- **DID methods** — `did:web` (default), `did:key` (local), and `did:hedera` (optional, via [`@helixid/did-hedera`](../sdk/did-hedera.md))
- **Agent onboarding with server-side key custody** — one call, no wallet file, no key material in the agent process
- **Presentation signing and verification** through the API, including delegation chains and consent rules
- **Service enrollment and user-consent grants**, with [`@helixid/widget`](../sdk/widget.md) for the consent page
- **Agent-to-agent delegation**, individually revocable
- **Credential issuance and revocation**, with Bitstring Status List hosting
- **Optional JWT session bridge** via the API (`POST /v1/vp/verify` with `session: true`)
- **MCP middleware** — HelixID presentations and standard OAuth bearer tokens on the same server, per-tool scopes, audit
- **LangChain/LangGraph and CrewAI** adapters, in TypeScript and Python
- **Audit log** of every issuance, consent, verification and authorization decision
- **Operator Console** — agents, onboarding, and the audit trail

## What running it yourself involves

The smallest runtime needs **no external infrastructure** beyond the API process: SQLite storage and an in-process memory cache. Postgres and a Redis second-level cache are available when you outgrow that — see [Environment & Configuration](./configuration.md).

```bash
git clone https://github.com/helixid/helixid.git
cd helixid
docker compose -f docker-compose.local.yml up --build helix-api
```

Running from source is covered in [Installation & Modes](../get-started/installation-and-modes.md#running-the-issuer-api).

You are responsible for:

| Concern | Why it's yours |
| --- | --- |
| **The issuer signing key** | It is the trust anchor for every credential in your domain. Use a KMS, an HSM, or at minimum encrypted-at-rest storage with IAM-scoped access. |
| **The custody master key** (`HOSTED_KEY_ENCRYPTION_KEY`) | Every agent and service key is encrypted under it. Lose it and those keys are unreadable; leak it with the database and every agent can be impersonated. |
| **The admin key** | It authorizes issuing, revoking, and signing as any agent. Keep it in your backends, never in an agent. |
| **Network exposure** | Some routes, including enrollment-token minting, are not key-gated. Put the API behind your own gateway and expose only what callers need. |
| **Serving `/.well-known/did.json`** | With `did:web`, your domain *is* the trust root. Its TLS and DNS are part of your security model. |
| **Hosting the status list** | Verifiers read it to check revocation. If it is unreachable, revocation checks fail. |
| **Cache TTLs** | They bound how long a revoked credential keeps working. See [Performance & Caching](../architecture/performance-and-caching.md). |
| **Storage** | SQLite fits a single-process deployment and local work. Use Postgres for anything with more than one instance or real write concurrency. |
| **Audit retention** | Treat audit logs as append-only evidence, and do not rely on a single datastore as the sole trail. |

## The trust-model question a hosted service would answer

Self-hosting solves your own infrastructure. It does not, by itself, solve **which other organizations' credentials you accept**.

HelixID removes the need for *bilateral federation agreements* — metadata exchange, certificate swapping — but it does not remove the trust decision itself. It converts it into a policy question: "should I accept credentials from Org A?"

| Model | Trust decision | Setup | Scaling |
| --- | --- | --- | --- |
| **Open** | Accept any issuer | Zero | O(1), high risk |
| **Decentralized** | Each org maintains its own allowlist | Medium | O(N) per org's list |
| **Centralized registry** | Query a shared trust registry | Low | O(1) |

Today, self-hosted deployments use the first two. Each verifier decides which issuer DIDs it trusts.

Verification itself does not apply an issuer allowlist: it proves a credential was signed by the issuer it names. Deciding that you accept agents from `did:web:partner.example` is a check your service makes on the verified result.

## HelixID Cloud

<span className="helix-badge helix-badge--progress">In progress</span>

A managed HelixID — the same issuer, verifier and audit log without running the server yourself — is being built and is not generally available. A shared trust registry that outsources issuer vetting is planned on top of it. See the [roadmap](../roadmap.md).

Nothing in the self-hosted stack depends on it, and the open-source path is not a limited edition of a paid product. Agents issued by a self-hosted server and agents issued by a managed one verify the same way.

## Next

- [Environment & Configuration](./configuration.md) — every variable
- [Security Model](../security/security-model.md) — what to get right in production
