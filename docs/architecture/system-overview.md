---
id: system-overview
title: System Overview
sidebar_label: System Overview
sidebar_position: 1
description: The components of a HelixID deployment, the agent lifecycle end to end, and the major flows.
---

# System Overview

A HelixID deployment has a small number of moving parts.

| Component | What it is | Required? |
| --- | --- | --- |
| HelixID server ([`helixid`](https://github.com/helixid/helixid), built on `@helixid/core`) | The issuer and verifier API — onboarding, key custody, credential lifecycle, presentation signing and verification, status list, `did:web` hosting, audit log, session bridge | Yes |
| SDK — [`@helixid/sdk-js`](../sdk/sdk-js.md) or [`helixid-sdk-py`](../sdk/sdk-py.md) | A typed client for that API, inside the agent and inside the service it calls | Yes |
| Framework adapters | [`@helixid/mcp-middleware`](../integrations/mcp.md), [LangChain](../integrations/langchain.md), [CrewAI](../integrations/crewai.md), [`@helixid/widget`](../sdk/widget.md) for consent pages | Optional |
| [Console](../self-hosting/console.md) | Operator web UI — agents, onboarding, audit trail | Optional |
| [`@helixid/cli`](../sdk/cli.md) / [`@helixid/mcp-server`](../sdk/mcp-server.md) | Operator tooling for issuer keys, status lists and low-volume issuance | Optional |

`@helixid/core` owns everything that makes a trust decision — DID resolution and caching, Ed25519 signing and verification, presentation verification, canonical JSON, key custody. The SDKs do not re-implement it; they call the API.

## Agent lifecycle, end to end

```
1. Agent onboarded
   └── Operator mints an enrollment token (scopes, delegation depth)
   └── Server generates the agent's keypair, keeps it encrypted in custody,
       creates its DID (the passport) and issues a HelixAgentCredential
       (the base visa: privilegeScopes = the agent's ceiling)
   └── The agent receives { agentDid, vcId } — no key, no wallet file

2. User consents (only when the agent acts for a user)
   └── The service shows its own consent page
   └── The service issues a DelegationGrantCredential (the service visa)
       under its own DID, for this agent and this user

3. Agent requests a presentation
   └── signVP(agentDid, serviceDid, { userDid? })
   └── Server gathers the agent's active credentials and matching grants
       and signs with the agent's custodial key. Valid for 5 minutes,
       bound to that one service.

4. Agent calls the service, presentation attached
   └── HTTP header (Authorization: HelixVP …) or MCP _meta

5. Service verifies — verifyVP() / MCP middleware → POST /v1/vp/verify
   ├── Presentation signature and expiry, target service
   ├── Each credential: signature, validity window, revocation
   ├── Delegation chain — linkage, scope subsetting, depth
   └── Consent rules → effectiveScopes

6. Decision → the service checks the scope the call needs:
   allowed (action executed) or denied (error + reason code)

7. Audit → issuance, consent, signing, verification, authorization and
   action are recorded — refusals included
```

Step 5 is a call from the service to the HelixID API it verifies with. It is never a call to the *agent's issuer* asking whether this particular request is allowed; see [What "Offline Verification" Actually Means](../concepts/offline-verification.md).

## The trust boundaries

Three separations do the real work:

- **The operator owns issuance policy.** Only the operator decides an agent's scopes and delegation depth, by minting the enrollment token and holding the admin key. An agent cannot grant itself authority.
- **The service owns consent and its own scope catalog.** A user's approval is recorded as a grant under the service's DID, valid only at that service. See [The Two-Issuer Model](../concepts/two-issuer-model.md).
- **The verifier owns the decision.** Verification returns facts — who, with what scopes, for which user. Whether that is enough for this call is the service's rule.

One boundary is deliberately *not* there: agents and services do not hold their own private keys. The HelixID server holds them in custody and signs on request, so whoever controls that server and its admin key can sign as any agent it onboarded. That is the central thing to protect in a deployment — see [Security Model](../security/security-model.md#key-custody).

## Major flows

Each of these maps to concrete surfaces in the [SDK](../sdk/sdk-js.md), [HTTP API](../sdk/http-api.md), and [CLI](../sdk/cli.md) references.

### 1. Onboarding → presentation → verification

| Step | Surfaces |
| --- | --- |
| Create enrollment token | `POST /v1/enrollment-tokens` |
| Onboard agent | `POST /v1/onboard`, `HelixClient.onboardAgent()`, `helix agent onboard` |
| Sign a presentation | `POST /v1/agents/:did/vp`, `HelixClient.signVP()`, `attachHelixVP()`, `HelixIDToolWrapper()` |
| Verify | `POST /v1/vp/verify`, `verifyVP()`, `helixidMCPMiddleware()` |
| Enforce scope | `requireScope()`, `checkScope()`, `filterToolsByScope()`, MCP `toolScopes` / `requiredScopes` |
| Optional session | `POST /v1/vp/verify` with `session: true`, `GET /v1/sessions/public-key`, `HelixClient.fetchSessionPublicKey()`, `HelixClient.verifySessionToken()` |

### 2. Service enrollment and user consent

| Step | Surfaces |
| --- | --- |
| Enroll a service | `POST /v1/services` |
| List the scopes a consent may offer | `GET /v1/service-delegation-grants/agent-scopes`, `HelixClient.getAgentScopes()`, `resolveConsentScopes()` |
| Issue the grant | `POST /v1/service-delegation-grants`, `HelixClient.issueServiceDelegationGrant()` |
| Sign a presentation for a user | `HelixClient.signVP(agentDid, serviceDid, { userDid })` |
| Revoke the grant | `POST /v1/vcs/:vcId/revoke`, `HelixClient.revokeVC()` |

### 3. Delegation

| Step | Surfaces |
| --- | --- |
| Allow delegation | `maxDelegationDepth` on the enrollment token |
| Delegate | `POST /v1/agents/:did/delegate`, `HelixClient.delegateAuthority()` |
| Present and verify | Same as flow 1 — the delegated credential and its chain are included automatically |
| Revoke a delegation | `POST /v1/vcs/:vcId/revoke` |

### 4. Revocation

| Step | Surfaces |
| --- | --- |
| Revoke | `POST /v1/vcs/:vcId/revoke`, `HelixClient.revokeVC()`, `helix revoke` |
| Check status | `GET /v1/vcs/:vcId/status`, `HelixClient.checkVCStatus()` |
| Publish/read status list | `GET /v1/status-list/:listId`, `POST /v1/status-list`, `HelixClient.getStatusList()`, `helix status-list create` |
| Verification after revoke | `verifyVP()`, `POST /v1/vp/verify`, `helixidMCPMiddleware()` |

### 5. DID lifecycle

| Step | Surfaces |
| --- | --- |
| Create DID | `POST /v1/dids`, `HelixClient.createDID()`, `helix did create` |
| Resolve DID | `GET /v1/dids/:did`, `HelixClient.resolveDID()` |
| Add / remove service endpoint | `POST /v1/dids/:did/services`, `DELETE /v1/dids/:did/services/:endpointId` |
| Deactivate DID | `POST /v1/dids/:did/deactivate`, `HelixClient.deactivateDID()` |

### 6. Credential issuance and renewal

`POST /v1/vcs` (`HelixClient.issueVC()`) issues a credential directly; `POST /v1/vcs/:vcId/renew` (`HelixClient.renewVC()`) issues a renewed one from an existing credential.

### 7. User DID challenge verification

`POST /v1/challenges` issues a challenge for a user DID; the user signs it; `POST /v1/challenges/:challengeId/verify` confirms the signature. SDK: `HelixClient.requestUserChallenge()` and `verifyUserChallenge()`.

### 8. Session bridge

Verify a VP once, optionally receive a short-lived token, and reuse it. `POST /v1/vp/verify` with `session: true`, then `GET /v1/sessions/public-key` and `HelixClient.verifySessionToken()`. See [Hybrid 3-Layer Design](./hybrid-layers.md).

## Standards foundation

| Standard | What it does |
| --- | --- |
| W3C DID Core 1.0 | Decentralized identifiers — structure, resolution, control |
| W3C VC Data Model 2.0 | Verifiable credentials — structure, proofs |
| Verifiable Presentations | Packaging and presenting credentials for verification |
| W3C Bitstring Status List | Credential revocation |
