---
id: http-api
title: HTTP API
sidebar_label: HTTP API
sidebar_position: 8
description: Every helix-api HTTP route — DIDs, credentials, status lists, verification, enrollment, challenges, and audit.
---

# HTTP API

Routes served by `helix-api`. Endpoints marked **admin** require the `x-admin-api-key` header.

Base URL is whatever you set as `API_BASE_URL` — `http://localhost:3000` by default.

## Health and discovery

| Method | Path | Purpose | Input | Output / notes |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | Check API health and runtime adapters. | None. | Status, version, environment, storage, database, cache adapter. |
| `GET` | `/.well-known/did.json` | Serve the issuer DID document for `did:web`. | None. | DID document or `DID_NOT_FOUND`. Cacheable for 1 hour. |

## DIDs

| Method | Path | Purpose | Input | Output / notes |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/dids` | Create a DID from an Ed25519 public key. | `publicKeyHex`, `subjectType`, optional HTTPS `domains`. | DID record, DID document, Hedera transaction id. |
| `GET` | `/v1/dids/:did` | Resolve a DID to its DID document. | DID path param, optional `?live=true`. | DID document. Returns `410` if deactivated. |
| `POST` | `/v1/dids/:did/services` | Add a service endpoint to the DID document. | `id`, `type`, HTTPS `serviceEndpoint`. | Updated DID document. |
| `DELETE` | `/v1/dids/:did/services/:endpointId` | Remove a service endpoint. | DID and endpoint id path params. | Updated DID document. |
| `POST` | `/v1/dids/:did/deactivate` | Permanently deactivate a DID. | DID path param. | `{ did, deactivated: true }`. |

## Credentials

| Method | Path | Purpose | Input | Output / notes |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/vcs` | Issue a credential. **admin** | `subjectDid`, `subjectType`, scopes/name/user/expiry fields. | VC, VC id, status index, expiry. |
| `GET` | `/v1/vcs` | List credential summaries. **admin** | Optional `subjectDid`, `status`, `limit`. | Array of VC summaries with DID, scopes, status, issue/expiry time, and delegation parent. |
| `GET` | `/v1/vcs/:vcId` | Fetch credential details. | VC id path param. | Stored VC response. |
| `POST` | `/v1/vcs/:vcId/revoke` | Revoke a credential by setting its status-list bit. **admin** | VC id path param. | Updated VC status. |
| `POST` | `/v1/vcs/:vcId/renew` | Issue a renewed credential from an existing VC. **admin** | VC id, optional `privilegeScopes`, `expiresInSeconds`. | New/renewed VC response. |

## Status lists

| Method | Path | Purpose | Input | Output / notes |
| --- | --- | --- | --- | --- |
| `GET` | `/v1/status-list/:listId` | Serve the public revocation status list credential. | Status list id. | Status list credential. Cacheable for 5 minutes. |
| `POST` | `/v1/status-list` | Create or replace a status list credential. **admin** | Optional `listId`, optional `length`. | Status list credential. |

## Verification and sessions

| Method | Path | Purpose | Input | Output / notes |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/vp/verify` | Verify a signed VP and optionally issue a session token. | `signedVP`, optional `session: true`. | Verification result, optionally session data. |
| `GET` | `/v1/sessions/public-key` | Return the API session JWT verification public key. | None. | Ed25519 public key metadata. Cacheable for 1 hour. |

`POST /v1/vp/verify` handles `vpId` replay tracking for you. If you verify locally with `verifyVP()` instead, replay protection becomes your responsibility — see [Authorization & Scopes](../concepts/authorization-and-scopes.md).

Session keys are startup-ephemeral: restarting the API rotates them and invalidates outstanding session tokens.

## Enrollment and onboarding

| Method | Path | Purpose | Input | Output / notes |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/enrollment-tokens` | Create an enrollment token for an agent. | `agentName`, `requestedScopes`, optional `requestedDomains`, `maxDelegationDepth`. | Enrollment token / challenge metadata. |
| `POST` | `/v1/enroll` | Legacy/direct enrollment proof flow. | `bootstrapToken`, `agentDid`, `timestamp`, `proofSignature`. | Issued VC for the agent. |
| `POST` | `/v1/onboard` | Onboarding step 1: create a challenge for a generated key. | `enrollmentToken`, `publicKeyHex`, optional `domains`. | `challengeId`, nonce, expiry, optional DID-create signing payload. |
| `POST` | `/v1/onboard/verify` | Onboarding step 2: verify the challenge and issue the VC. | `challengeId`, `signature`, optional `didCreateSignature`. | `agentDid`, `vc`, `vcId`. |

Minting an enrollment token is a privileged **operator policy action** — it decides scopes, delegation depth, and domains. See [Installation & Modes](../get-started/installation-and-modes.md#enrolling-an-agent).

## User challenges

| Method | Path | Purpose | Input | Output / notes |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/challenges` | Issue a user verification challenge. | `did`, `purpose: "user_verification"`. | Challenge id, nonce, expiry. |
| `POST` | `/v1/challenges/:challengeId/verify` | Verify a user challenge signature. | Challenge id, `signature`. | Verified DID and optional VC. |

## Audit log

| Method | Path | Purpose | Input | Output / notes |
| --- | --- | --- | --- | --- |
| `GET` | `/v1/audit-log` | List audit events. **admin** | Optional `eventType`, `since`, `limit`. | Newest-first summaries, including derived `delegatedFrom`, `delegatedTo`, `parentVcId`, and `delegationDepth` for VP verification events when delegation context is available; `attemptedVcId`, `attemptedParentVcId`, `attemptedDelegatedFrom` for rejections; `issuer`, `userDid`, `scopes`, `durability` for consent events. |
| `POST` | `/v1/audit-log/vp-verification` | Record an API-backed VP verification entry. **admin** | `vpId`, `agentDid`, `result`, optional `targetService`, `reason`, `delegatedFrom`, `delegatedTo`, `delegationChain`, `verifiedAt`, and on rejections `attemptedVcId`, `attemptedParentVcId`, `attemptedDelegatedFrom`. | Audit entry recorded. |
| `POST` | `/v1/audit-log/consent-granted` | Record an agent-side `CONSENT_GRANTED` entry when an SP-issued delegation grant lands in the wallet. **admin** | `vcId`, `agentDid`, optional `issuer`, `userDid`, `scopes`, `durability`, `grantedAt`. | Audit entry recorded. |
| `POST` | `/v1/audit-log/events` | Generic activity-trail ingestion, used by service providers and agents to record the identity → credential → presentation → verification → authorization → action → result chain. **admin** | `event` plus at least one of `agentDid` / `serviceDid`; optional `correlationId`, `userDid`, `vcId`, `credentialType`, `issuer`, `scopes`, `validUntil`, `credentialStatus`, `serviceName`, `toolName`, `requiredScope`, `effectiveScopes`, `vpId`, `result`, `reason`, `resultSummary`, `timestamp`. | Audit entry recorded. |

### Event types

`VC_ISSUED` · `VC_PRESENTED` · `VP_VERIFIED` · `VP_REJECTED` · `AUTHZ_GRANTED` · `AUTHZ_DENIED` · `TOOL_INVOKED` · `CONSENT_GRANTED` · `CONSENT_REVOKED`

Use `correlationId` to tie one agent action's whole chain together across services.
