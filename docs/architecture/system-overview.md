---
id: system-overview
title: System Overview
sidebar_label: System Overview
sidebar_position: 1
description: The components of a HelixID deployment, the agent lifecycle end to end, and the major flows.
---

# System Overview

A HelixID deployment has four moving parts. Only the first is required in every deployment.

| Component | What it is | Required? |
| --- | --- | --- |
| `@helixid/sdk-js` | The library inside the agent and inside the verifier | Yes |
| `helix-api` | Fastify issuer service — enrollment, VC lifecycle, status list, `did:web` hosting, session bridge | For issuer-backed credentials |
| `console` | Operator web UI — agents, enrollment, audit trail | Optional |
| `@helixid/cli` | Operator CLI for low-volume issuance and revocation | Optional, an alternative to the API |

`helix-core` sits under the SDK and the API, and owns everything cryptographic — DID resolution and caching, Ed25519 signing and verification, VP verification, canonical JSON. Nothing above it re-implements crypto.

## Agent lifecycle, end to end

```
1. Agent Created
   └── DID generated → did:key (local) / did:web (default) / did:hedera (optional plugin)
   └── Wallet created → stores encrypted private key + credentials

2. Credentials Issued
   └── Platform signs HelixAgentCredential → delivered to agent wallet
       (identity + privilegeScopes = the agent's ceiling, never exceeded downstream)
   └── On first call to a new service provider, the SP issues a
       DelegationGrantCredential after the user consents

3. Agent Requests Action
   └── Builds a Verifiable Presentation from the relevant credentials,
       signs it with its private key — locally, no network

4. Verifier Validates
   ├── Verify VP signature using the agent's DID public key
   ├── Resolve the DID document (cached static read)
   ├── Verify the VC signature and validity window
   ├── Walk the delegation chain — signatures, scope subsetting, depth
   ├── Evaluate scopes (effectiveScopes)
   └── Check revocation status (Bitstring Status List)

5. Decision → approved (action executed) or denied (error + reason code)

6. Audit → the whole chain is recorded: issuance, consent, presentation,
   verification, authorization, action, result — refusals included
```

Step 4 happens **in-process**. The verifier never calls the issuer to ask whether this particular request is allowed; see [What "Offline Verification" Actually Means](../concepts/offline-verification.md).

## The trust boundaries

Three separations do the real work, and each exists because the alternative collapses authority into the wrong hands:

- **The agent owns its keys.** Private keys are generated in the agent process and encrypted at rest in its wallet. The issuer never sees them, so the issuer cannot impersonate an agent.
- **The operator owns issuance policy.** Only an authenticated operator can mint an enrollment token deciding scopes, delegation depth, and domains. If agents could mint their own, identity and authorization would collapse into self-granted authority.
- **The service provider owns consent and its own scope catalog.** The SP signs its own grants with its own key and hosts its own status list. See [The Two-Issuer Model](../concepts/two-issuer-model.md).

## Major flows

Each of these maps to concrete surfaces in the [SDK](../sdk/sdk-js.md), [HTTP API](../sdk/http-api.md), and [CLI](../sdk/cli.md) references.

### 1. Enrollment → issuance → presentation → verification

| Step | Surfaces |
| --- | --- |
| Create enrollment token | `POST /v1/enrollment-tokens`, or operator-side `helix vc issue` |
| Onboard agent | `HelixClient.requestOnboardingChallenge()`, `HelixClient.completeOnboarding()`, `POST /v1/onboard`, `POST /v1/onboard/verify`, `AgentWallet.save()` |
| Store/read credential | `AgentWallet.addCredential()`, `AgentWallet.credentials`, `AgentWallet.load()` |
| Issue VP | `VPBuilder.sign()`, `HelixIDMiddleware()`, `HelixIDToolWrapper()`, `attachHelixVP()` |
| Verify VP | `POST /v1/vp/verify`, `verifyVP()`, `helixidMCPMiddleware()` |
| Enforce scope | `requireScope()`, `checkScope()`, `filterToolsByScope()`, MCP `requiredScopes` |
| Optional session | `POST /v1/vp/verify` with `session: true`, `GET /v1/sessions/public-key`, `HelixClient.fetchSessionPublicKey()`, `HelixClient.verifySessionToken()` |

### 2. Delegation

| Step | Surfaces |
| --- | --- |
| Load parent credential | `AgentWallet.load()`, `AgentWallet.credentials` |
| Create delegated VC | `delegate(options, wallet)` |
| Store delegated VC | `AgentWallet.addCredential()`, `AgentWallet.updateCredential()` |
| Issue VP from delegated VC | `VPBuilder.sign()`, `HelixIDMiddleware()`, `attachHelixVP()` |
| Verify delegation chain | `verifyVP()`, `POST /v1/vp/verify`, `helixidMCPMiddleware()` |
| Enforce delegated scopes | `requireScope()`, `checkScope()`, `filterToolsByScope()`, MCP `requiredScopes` |

### 3. Revocation

| Step | Surfaces |
| --- | --- |
| Enroll and issue VC | `POST /v1/enrollment-tokens`, `POST /v1/onboard`, `POST /v1/onboard/verify` |
| Direct issue alternative | `POST /v1/vcs`, `HelixClient.issueVC()`, `helix vc issue` |
| Publish/read status list | `GET /v1/status-list/:listId`, `POST /v1/status-list`, `HelixClient.getStatusList()`, `helix status-list create` |
| Revoke VC | `POST /v1/vcs/:vcId/revoke`, `HelixClient.revokeVC()`, `helix revoke` |
| Check VC status | `HelixClient.checkVCStatus()` |
| Verification after revoke | `verifyVP()`, `POST /v1/vp/verify`, `helixidMCPMiddleware()` |

### 4. DID lifecycle

| Step | Surfaces |
| --- | --- |
| Create DID | `POST /v1/dids`, `HelixClient.createDID()`, `AgentWallet.createDID()`, `helix did create` |
| Resolve DID | `GET /v1/dids/:did`, `HelixClient.resolveDID()`, `HelixDidResolver.resolve()` |
| Add service endpoint | `POST /v1/dids/:did/services`, `AgentWallet.addService()` |
| Remove service endpoint | `DELETE /v1/dids/:did/services/:endpointId`, `AgentWallet.removeService()` |
| Deactivate DID | `POST /v1/dids/:did/deactivate`, `AgentWallet.deactivate()` |

### 5. Credential renewal

`POST /v1/vcs/:vcId/renew` (or `HelixClient.renewVC()`) issues a renewed credential; store it with `AgentWallet.addCredential()` or `updateCredential()`, and read the current one with `AgentWallet.getLatestCredential()`.

### 6. User DID challenge verification

`POST /v1/challenges` issues a challenge for a user DID; the user signs it; `POST /v1/challenges/:challengeId/verify` confirms the signature. SDK: `HelixClient.requestUserChallenge()` and `verifyUserChallenge()`.

### 7. Session bridge

Verify a VP once, optionally receive a short-lived token, and reuse it. `POST /v1/vp/verify` with `session: true`, then `GET /v1/sessions/public-key` and `HelixClient.verifySessionToken()`. See [Hybrid 3-Layer Design](./hybrid-layers.md).

### 8. Local dev credential flow

`AgentWallet.create()` → `AgentWallet.selfIssueVC()` (or `helix vc self-issue`) → `VPBuilder.sign()` → `verifyVP({ allowSelfSigned: true })`. Development only — see [Verifiable Credentials](../concepts/verifiable-credentials.md#self-issued-credentials).

### 9. Wallet management

`helix wallet inspect` shows wallet contents without printing the private key. Programmatically: `addCredential()`, `updateCredential()`, `removeCredential()`, `listCredentials()`, `getCredential()`, `getLatestCredential()`.

## Standards foundation

| Standard | What it does |
| --- | --- |
| W3C DID Core 1.0 | Decentralized identifiers — structure, resolution, control |
| W3C VC Data Model 2.0 | Verifiable credentials — structure, proofs |
| Verifiable Presentations | Packaging and presenting credentials for verification |
| Bitstring Status List (StatusList2021) | Credential revocation |
