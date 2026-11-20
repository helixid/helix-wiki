---
id: http-api
title: HTTP API
sidebar_label: HTTP API
sidebar_position: 8
description: Every helix-api HTTP route — DIDs, credentials, agents, services, consent grants, status lists, verification, challenges, and audit.
---

# HTTP API

Routes served by `helix-api`, as implemented by the route plugins in [`@helixid/core`](./core.md) **3.0.0**.

The base URL is whatever you set as `API_BASE_URL`. A local server usually runs at `http://localhost:3000`.

:::note[Server repo version]
The open-source [`helixid`](https://github.com/helixid/helixid) server still pins `@helixid/core` `^2.0.1` on `main`. Routes added in 3.0.0 — `POST /v1/services`, `POST /v1/service-delegation-grants`, `GET /v1/service-delegation-grants/agent-scopes` — are not served by that build until it moves to 3.0.0. This page describes 3.0.0.
:::

## Authentication

There is one credential on a self-hosted server: the operator's admin key, sent as the `x-admin-api-key` header. It must equal `HELIX_ADMIN_API_KEY`. A missing or wrong key returns `403 ADMIN_AUTH_REQUIRED`.

How each group of routes checks it:

| Routes | Rule |
| --- | --- |
| Credential writes and listing (`/v1/vcs`), `POST /v1/status-list`, agent signing and delegation (`/v1/agents/:did/*`), all of `/v1/audit-log` | The plugin compares `x-admin-api-key` with the configured admin key. Fixed; not replaceable. |
| DID writes (`POST /v1/dids`, service endpoints, deactivate) | The plugin takes an `authorize(request, action)` function. If the server does not supply one, the default is the admin-key check. If the server supplies neither `authorize` nor `adminApiKey`, **every DID write is refused**. DID reads stay open. |
| Service enrollment and consent grants (`/v1/services`, `/v1/service-delegation-grants*`) | Same `authorize` hook, defaulting to the admin-key check. |
| Everything else | No key checked. See the list below. |

Routes that check no key: `GET /health`, the three `did.json` routes, `GET /v1/dids/:did`, `GET /v1/vcs/:vcId`, `GET /v1/vcs/:vcId/status`, `GET /v1/status-list/:listId`, `POST /v1/vp/verify`, `GET /v1/sessions/public-key`, `POST /v1/enrollment-tokens`, `POST /v1/onboard`, `POST /v1/challenges`, and `POST /v1/challenges/:challengeId/verify`.

:::caution[Two things to know before exposing the API]
- `POST /v1/enrollment-tokens` does not check the admin key in the core route plugin, even though minting a token decides an agent's scopes and delegation depth. Treat it as an operator action and restrict who can reach it at the network layer.
- The reference `src/server.ts` in `helix-core` registers the DID routes without `adminApiKey` or `authorize`, so on that server `POST /v1/dids`, the service-endpoint routes, and deactivate always return `403`. Agent and service DIDs are still created, internally, by onboarding and service enrollment.
:::

The admin key is all-or-nothing. Anyone holding it can sign a presentation for any agent on the instance, delegate from it, and issue or revoke any credential.

## Health and discovery

| Method | Path | Auth | Input | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | Open | None. | `status`, `version`, `environment`, `storageAdapter`, `database`, `cacheAdapter`, `didMethod`, `issuerDid`. |
| `GET` | `/.well-known/did.json` | Open | None. | The issuer DID document, or `404 DID_NOT_FOUND`. `Cache-Control: public, max-age=3600`. |
| `GET` | `/agents/:slug/did.json` | Open | Slug path param. | DID document for `did:web:<DID_DOMAIN>:agents:<slug>`. `404 DID_NOT_FOUND`, `410 DID_DEACTIVATED`. Cacheable for 1 hour. |
| `GET` | `/services/:slug/did.json` | Open | Slug path param. | DID document for `did:web:<DID_DOMAIN>:services:<slug>`. Same errors and caching. |

The two per-subject `did.json` routes are how `did:web` agent, user, and service DIDs minted by this instance resolve. `database` in `/health` is the Postgres database name or the SQLite file path.

## DIDs

| Method | Path | Auth | Input | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/dids` | `authorize` (action `create`) | `publicKeyHex` (64 hex chars), `subjectType` (`agent` or `user`), optional `domains` (up to 10 `https://` URLs). | `201` with `id`, `subjectType`, `controller`, `publicKey`, `hederaTransactionId`, `didDocument`. |
| `GET` | `/v1/dids/:did` | Open | DID path param, optional `?live=true`. | The DID document. `410 DID_DEACTIVATED` if deactivated. |
| `POST` | `/v1/dids/:did/services` | `authorize` (action `update`) | `id`, `type`, `serviceEndpoint` (`https://` URL). | Updated DID document. |
| `DELETE` | `/v1/dids/:did/services/:endpointId` | `authorize` (action `update`) | DID and endpoint id path params. | Updated DID document. |
| `POST` | `/v1/dids/:did/deactivate` | `authorize` (action `deactivate`) | DID path param. | `{ did, deactivated: true }`. Permanent. |

The `:did` param accepts `did:key`, `did:web`, and `did:hedera` identifiers. Which method `POST /v1/dids` mints is set by `DID_METHOD`.

## Agents

| Method | Path | Auth | Input | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/enrollment-tokens` | None checked (see above) | `agentName`, `requestedScopes`, optional `requestedDomains`, `maxDelegationDepth` (default `0`), `expiry`. | `201` with `token` and, when `expiry` was given, `expiresAt`. |
| `POST` | `/v1/onboard` | Open; the enrollment token is the credential | `enrollmentToken`, optional `domains`. | `201` with `{ agentDid, vcId }`. |
| `POST` | `/v1/agents/:did/vp` | **admin** | `targetService` (the service's DID), optional `userDid`. | `200` with `{ signedVP }`. |
| `POST` | `/v1/agents/:did/delegate` | **admin** | `to`, `scopes`, `expiresIn` (seconds), optional `vcId`, `revokeExisting`. | `200` with `delegatedVC`, plus `replacedVcIds`, `revokedVcIds`, `retainedVcIds`. |

**Enrollment tokens.** `expiry` is a whole number of **days**. Leave it out (or send `null`) and the token does not expire, and neither does the credential of the agent it onboards. A value that is not a positive integer returns `400 INVALID_EXPIRY`. Scopes are validated when the token is minted. A token is single-use.

**Onboarding.** One call. The server generates the agent's Ed25519 key pair, creates the DID, issues the `HelixAgentCredential`, and stores the private key encrypted (see [`HOSTED_KEY_ENCRYPTION_KEY`](../self-hosting/configuration.md#key-custody)). No key material is returned. The old two-step flow (`POST /v1/onboard` with a public key, then `POST /v1/onboard/verify`) and `POST /v1/enroll` are gone.

**Signing a presentation.** The agent holds no key, so signing is an API call. The server picks the credentials: every active `HelixAgentCredential` the agent holds, and, when `userDid` is given, every active `DelegationGrantCredential` that `targetService` issued to this agent for that user. If the agent itself has no such grant, a grant held by an agent further up its delegation chain is used, unless that grant says `allowDelegation: false`. Errors: `400 VALIDATION_ERROR` when `targetService` is not a DID, `404 AGENT_KEY_NOT_FOUND`, `404 AGENT_ACTIVE_CREDENTIAL_NOT_FOUND`, `404 CONSENT_GRANT_NOT_FOUND` when a `userDid` was given and no grant covers it. A signed VP expires five minutes after signing.

**Delegating.** `to` must be an agent this server onboarded that still holds an active credential (`404 DELEGATEE_NOT_AN_AGENT` otherwise). The scopes must be a subset of the source credential's, and the source must have delegation depth left. Without `vcId`, the server picks the one eligible credential; when more than one is eligible it returns `400 VP_MULTIPLE_ACTIVE_VC` and you pass `vcId` to choose. Each delegated credential gets its own status-list entry, so it can be revoked on its own with `POST /v1/vcs/:vcId/revoke`.

## Services and consent grants

| Method | Path | Auth | Input | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/services` | `authorize` (action `enroll`) | `name`, `domain`, `requiredScopes`, optional `description`, `framework`. | `201` with the service record: `id`, `did`, `name`, `domain`, `requiredScopes`, `description`, `framework`, `createdAt`, `revokedAt`. |
| `POST` | `/v1/service-delegation-grants` | `authorize` (action `grant`) | `serviceDid`, `agentDid`, `userDid`, `scopes`, optional `durability` (`standing` or `session`, default `standing`), `allowDelegation`, `revokeExisting`. | `201` with `grantVC`, plus `replacedVcIds`, `revokedVcIds`, `retainedVcIds`. |
| `GET` | `/v1/service-delegation-grants/agent-scopes` | `authorize` (action `agentScopes`) | Query `serviceDid`, `agentDid`. | `{ agentDid, scopes }` — the scopes a grant to this agent may carry. |

**Enrolling a service.** A service is a custodial identity, like an agent: the server generates its key pair, creates its DID (with `DID_METHOD=web`, `did:web:<DID_DOMAIN>:services:<slug>`), and holds the key. Service names are unique; a duplicate returns `409 SERVICE_ALREADY_EXISTS`.

**Issuing a consent grant.** The service's backend calls this after the user consents. The server signs a `DelegationGrantCredential` with the service's key, gives it a status-list entry, and stores it. Rules enforced at issuance:

- The service must be enrolled and not revoked (`404 SERVICE_NOT_FOUND`, `409 SERVICE_REVOKED`, `404 SERVICE_KEY_NOT_FOUND`).
- The agent must be onboarded here and hold an active credential of its own (`404 DELEGATEE_NOT_AN_AGENT`, `404 AGENT_ACTIVE_CREDENTIAL_NOT_FOUND`).
- Every scope must be one the agent holds on its own, non-delegated credentials (`400 CONSENT_GRANT_SCOPE_NOT_ALLOWED`). A grant that carries nothing but the terms-acceptance scope is refused (`400 CONSENT_NO_GRANTABLE_SCOPES`).
- `userDid` is recorded as given; it is not resolved.

A `standing` grant is valid for about ten years, a `session` grant for 24 hours. Consenting again to the same scope set replaces the earlier grant; a different scope set stands beside it unless `revokeExisting` is `true`. Revoke a grant with `POST /v1/vcs/:vcId/revoke`.

## Credentials

| Method | Path | Auth | Input | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/vcs` | **admin** | `subjectDid`, `subjectType` (`agent` or `user`); for agents `privilegeScopes` and `agentName`; for users `userId`; optional `expiresInSeconds`, `expiresAt`, `maxDelegationDepth`, `revokeExisting`. | `201` with `vcId`, `vc`, `statusListIndex`, `expiresAt`. |
| `GET` | `/v1/vcs` | **admin** | Optional `subjectDid`, `status` (`active`, `revoked`, `expired`), `limit` (default 50). | Array of summaries: `vcId`, `subjectDid`, `vcType`, `agentName`, `scopes`, `status`, `issuedAt`, `expiresAt`, `parentVcId`. |
| `POST` | `/v1/vcs/register` | **admin** | `{ vc }` — a credential signed outside this server. | `201`, or `200` when already registered: `{ vcId, alreadyRegistered }`. |
| `GET` | `/v1/vcs/:vcId` | Open | VC id path param. | `vcId`, `vc`, `status`, `expiresAt`, `revokedAt`, `renewedByVcId`. |
| `GET` | `/v1/vcs/:vcId/status` | Open | VC id path param. | `{ vcId, status }`. |
| `POST` | `/v1/vcs/:vcId/revoke` | **admin** | VC id path param. | `{ vcId, revoked: true, revokedAt }`. `409 VC_ALREADY_REVOKED` on a repeat. |
| `POST` | `/v1/vcs/:vcId/renew` | **admin** | Optional `privilegeScopes`, `expiresInSeconds`. | `201` with the new credential's `vcId`, `vc`, `statusListIndex`, `expiresAt`, and `previousVcId`. |

`POST /v1/vcs` issues a credential signed by the platform issuer. When neither `expiresInSeconds` nor `expiresAt` is given the credential is valid for 90 days; `expiresAt: null` issues one with no expiry.

`POST /v1/vcs/register` is the path for a `DelegationGrantCredential` that a service signed with a key it keeps itself. The proof is verified against the issuer's resolved DID document before anything is stored. Services enrolled with `POST /v1/services` do not need it — use `POST /v1/service-delegation-grants`.

## Status lists

| Method | Path | Auth | Input | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/v1/status-list/:listId` | Open | Status list id. | The status list credential. `Cache-Control: public, max-age=300`. |
| `POST` | `/v1/status-list` | **admin** | Optional `listId`, `length`. | `201` with the status list credential. |

The default list is `helix-status-list-1` with 131,072 entries. Platform-issued credentials, delegated credentials, and grants issued through `POST /v1/service-delegation-grants` all take entries on it.

## Verification and sessions

| Method | Path | Auth | Input | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/vp/verify` | Open | `signedVP`, optional `session`, `expectedTargetService`, `allowSelfSigned`. | `200` with the verification result. |
| `GET` | `/v1/sessions/public-key` | Open | None. | `publicKeyHex`, `publicKeyMultibase`, `alg` (`EdDSA`), `crv` (`Ed25519`). Cacheable for 1 hour. |

Request options:

| Field | Meaning |
| --- | --- |
| `signedVP` | The presentation, as a JSON object. Required. |
| `expectedTargetService` | Reject the VP unless its `targetService` equals this value. A verifier should always send its own service DID. |
| `session` | `true` also returns a short-lived session token. |
| `allowSelfSigned` | Accept a credential whose issuer is its own subject. Off by default (`403 SELF_SIGNED_VC_NOT_ALLOWED`). |

Result fields on success:

| Field | Meaning |
| --- | --- |
| `valid` | Always `true` in a `200` response. |
| `agentDid` | The VP holder. |
| `targetService` | The service the VP was signed for. |
| `privilegeScopes` | Union of the scopes on every valid agent credential in the VP. |
| `effectiveScopes` | The scopes to enforce. Equal to `privilegeScopes` when the VP carries no grant; otherwise the union, over each valid grant, of the grant's scopes intersected with the authority that grant covers. |
| `vpId` | The presentation's id. |
| `delegationChain` | The verified delegation links, root to leaf. |
| `verifiedAt` | Server timestamp. |
| `userDid` | Present when the VP names a user it acts for. |
| `warning` | Present when a self-signed credential was accepted. |
| `session` | Present when requested: `token`, `expiresAt`, `publicKeyEndpoint`. |

A VP that fails verification does not come back as `valid: false`. The response is a `4xx` with the error envelope below and a specific code, such as `VP_EXPIRED`, `VP_SIGNATURE_INVALID`, `VC_REVOKED`, or `CONSENT_GRANT_WRONG_SERVICE`. Each call writes one `VP_VERIFIED` or `VP_REJECTED` audit event.

:::caution[A VP is not single-use]
`POST /v1/vp/verify` does not track consumed `vpId`s. The same VP verifies again until it expires, five minutes after signing, and only for the one `targetService` it names. If you need single-use presentations, record `vpId` in your own service and reject repeats. Single-use enforcement in the API is planned. See [Authorization & Scopes](../concepts/authorization-and-scopes.md).
:::

Session tokens are signed with an Ed25519 key pair generated when the API starts. Restarting the API rotates it and invalidates outstanding session tokens. The token lifetime is `JWT_SESSION_TTL_SECONDS`.

## User challenges

| Method | Path | Auth | Input | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/challenges` | Open | `did`, `purpose: "user_verification"`. | `201` with `challengeId`, `nonce`, `expiresAt`. |
| `POST` | `/v1/challenges/:challengeId/verify` | Open | `signature` (Ed25519 signature over the nonce bytes, 128 hex chars). | `{ did, verified: true, vc }`. |

A challenge is valid for five minutes. On success, if the DID has no active credential, the server issues a user credential valid for 90 days and returns it as `vc`.

## Audit log

Every route here requires the admin key.

| Method | Path | Input | Response |
| --- | --- | --- | --- |
| `GET` | `/v1/audit-log` | Optional `eventType`, `since` (ISO timestamp), `limit` (1–500, default 50). | Array of event summaries. |
| `POST` | `/v1/audit-log/vp-verification` | `vpId`, `agentDid`, `result` (`success` or `rejected`); optional `targetService`, `reason`, `delegationChain`, `delegatedFrom`, `delegatedTo`, `parentVcId`, `delegationDepth`, `verifiedAt`, `source`, and on rejections `attemptedVcId`, `attemptedParentVcId`, `attemptedDelegatedFrom`. | `201` with `{ recorded: true, eventType, timestamp }`. |
| `POST` | `/v1/audit-log/consent-granted` | `vcId`, `agentDid`; optional `issuer`, `userDid`, `scopes`, `durability`, `grantedAt`, `source`. | `201` with `{ recorded: true, eventType, timestamp }`. |
| `POST` | `/v1/audit-log/events` | `event` plus at least one of `agentDid` / `serviceDid`; optional `correlationId`, `userDid`, `vcId`, `credentialType`, `issuer`, `scopes`, `validUntil`, `credentialStatus`, `serviceName`, `toolName`, `requiredScope`, `effectiveScopes`, `vpId`, `result`, `reason`, `resultSummary`, `timestamp`, `source`. | `201` with `{ recorded: true, eventType, timestamp }`. |

`GET /v1/audit-log` returns each event's `id`, `eventType`, `timestamp`, `subjectDid`, `vcId`, `targetService`, and `result`, plus whichever of these the event carries: the verified delegation fields (`delegatedFrom`, `delegatedTo`, `parentVcId`, `delegationDepth`), the unverified rejection context (`attemptedVcId`, `attemptedParentVcId`, `attemptedDelegatedFrom`), the consent fields (`issuer`, `userDid`, `scopes`, `durability`), and the activity-trail fields (`correlationId`, `credentialType`, `validUntil`, `credentialStatus`, `serviceDid`, `serviceName`, `toolName`, `requiredScope`, `effectiveScopes`, `reason`, `resultSummary`).

The three `POST` routes let a verifier, a service, or a middleware add its side of the story. `/vp-verification` records `VP_VERIFIED` or `VP_REJECTED` depending on `result`. `/events` is the general one. Use `correlationId` to tie one agent action's whole chain together across services.

### Event types

`POST /v1/audit-log/events` accepts only these:

`VC_ISSUED` · `VC_PRESENTED` · `VP_VERIFIED` · `VP_REJECTED` · `AUTHZ_GRANTED` · `AUTHZ_DENIED` · `TOOL_INVOKED` · `CONSENT_GRANTED` · `CONSENT_REVOKED`

The API itself also writes the following, which you can pass as `eventType` to `GET /v1/audit-log`:

| Area | Events |
| --- | --- |
| DIDs | `DID_CREATED`, `DID_CREATION_FAILED`, `DID_RESOLVED`, `DID_UPDATED`, `DID_UPDATE_FAILED`, `DID_DEACTIVATED` |
| Credentials | `VC_ISSUED`, `VC_ISSUANCE_FAILED`, `VC_REVOKED`, `VC_REVOCATION_FAILED`, `VC_RENEWED`, `VC_RENEWAL_FAILED`, `VC_STATUS_CHECKED`, `STATUS_LIST_UPDATED`, `VC_DELEGATED`, `DELEGATION_FAILED` |
| Presentations | `VP_TEMPLATE_ISSUED`, `VP_VERIFIED`, `VP_REJECTED`, `CHAIN_VERIFIED`, `CHAIN_REJECTED`, `JWT_ISSUED`, `JWT_REJECTED` |
| Agents and users | `ENROLLMENT_TOKEN_GENERATED`, `ENROLLMENT_TOKEN_CONSUMED`, `ENROLLMENT_TOKEN_REJECTED`, `CHALLENGE_ISSUED`, `CHALLENGE_VERIFIED`, `CHALLENGE_REJECTED`, `AGENT_ONBOARDED`, `AGENT_VP_SIGNED`, `USER_DID_VERIFIED` |
| Services and consent | `SERVICE_ENROLLED`, `CONSENT_GRANTED`, `CONSENT_REVOKED` |
| Activity trail | `VC_PRESENTED`, `AUTHZ_GRANTED`, `AUTHZ_DENIED`, `TOOL_INVOKED` |

This is the list of names defined in the code. Not every name is emitted by a current code path.

## Errors

Every error response has the same shape:

```json
{
  "error": {
    "code": "VC_NOT_FOUND",
    "message": "Credential not found",
    "requestId": "req_5f0c2a9e1b7d4c3a8e6f"
  }
}
```

Some errors add a `details` object. A request body that fails schema validation returns `400 VALIDATION_ERROR` with `details.issues`.

The codes you are most likely to meet:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | The request is malformed or missing a required field. |
| `ADMIN_AUTH_REQUIRED` | 403 | `x-admin-api-key` is missing or wrong, or the route has no key configured. |
| `INTERNAL_ERROR` | 500 | Unexpected failure. Details are logged, not returned. |
| `DID_NOT_FOUND` | 404 | No such DID on this instance. |
| `DID_ALREADY_EXISTS` | 409 | A DID already exists for this public key. |
| `DID_DEACTIVATED` | 410 | The DID was deactivated. |
| `DID_METHOD_NOT_AVAILABLE` | 501 | The requested DID method is not available on this instance. |
| `UNSUPPORTED_DID_METHOD` | 400 | The DID uses a method the API does not handle. |
| `SERVICE_ENDPOINT_NOT_FOUND` / `SERVICE_ENDPOINT_ALREADY_EXISTS` | 404 / 409 | DID document service-endpoint edits. |
| `HEDERA_ANCHOR_FAILED` / `HEDERA_RESOLUTION_FAILED` | 502 | A Hedera write or mirror-node read failed. |
| `VC_NOT_FOUND` | 404 | No such credential. |
| `VC_ALREADY_REVOKED` | 409 | Revoking or renewing a credential that is already revoked. |
| `VC_SUBJECT_DID_NOT_FOUND` | 404 | The credential's subject DID cannot be resolved. |
| `VC_INVALID_PRIVILEGE_SCOPE` | 400 | A scope breaks the scope rules. |
| `VC_EXPIRED` / `VC_NOT_YET_VALID` / `VC_REVOKED` | 400 | A credential in the VP is outside its validity window or revoked. |
| `VC_SIGNATURE_INVALID` / `VC_ISSUER_NOT_FOUND` | 400 | The credential's proof does not verify, or its issuer cannot be resolved. |
| `SELF_SIGNED_VC_NOT_ALLOWED` | 403 | Self-signed credential without `allowSelfSigned`. |
| `STATUS_LIST_INDEX_EXHAUSTED` | 503 | The status list has no free entries. |
| `SCOPE_ESCALATION_DENIED` | 400 | Delegated scopes are not a subset of the source credential's. |
| `MAX_DELEGATION_DEPTH_EXCEEDED` | 400 | The source credential has no delegation depth left. |
| `SELF_DELEGATION_NOT_ALLOWED` | 400 | An agent tried to delegate to itself. |
| `DELEGATION_CHAIN_INVALID` | 400 | A link in the VP's delegation chain does not verify. |
| `DELEGATEE_NOT_AN_AGENT` | 404 | The delegatee, or the agent named in a grant, is not an onboarded agent. |
| `VP_EXPIRED` | 400 | The presentation is past its expiry. |
| `VP_SIGNATURE_INVALID` | 400 | The holder's signature does not verify. |
| `VP_INVALID_STRUCTURE` | 400 | The VP is malformed, or `targetService` does not match. |
| `VP_VERIFICATION_FAILED` | 400 | Verification failed for a reason with no more specific code. |
| `VP_MULTIPLE_ACTIVE_VC` | 400 | More than one credential is eligible; pass `vcId`. |
| `CONSENT_GRANT_REQUIRED` | 400 | The VP names a user but carries no grant from them. |
| `CONSENT_GRANT_SUBJECT_MISMATCH` | 400 | A grant in the VP is for another agent or another user. |
| `CONSENT_GRANT_WRONG_SERVICE` | 400 | A grant was not issued by the VP's `targetService`. |
| `CONSENT_GRANT_NOT_DELEGABLE` | 400 | A grant with `allowDelegation: false` was used by a sub-agent. |
| `CONSENT_GRANT_NOT_FOUND` | 404 | Signing for a user with no active grant on file. Send the user to the service's consent screen. |
| `CONSENT_GRANT_SCOPE_NOT_ALLOWED` | 400 | A grant asked for scopes the agent does not hold itself. |
| `CONSENT_NO_GRANTABLE_SCOPES` | 400 | A grant carries no usable scope. |
| `CONSENT_GRANT_INVALID` | 400 | A grant credential is structurally invalid. |
| `SERVICE_NOT_FOUND` / `SERVICE_KEY_NOT_FOUND` | 404 | The service is not enrolled, or the server holds no key for it. |
| `SERVICE_ALREADY_EXISTS` / `SERVICE_REVOKED` | 409 | Duplicate service name, or the service was revoked. |
| `ENROLLMENT_TOKEN_NOT_FOUND` | 404 | Unknown enrollment token. |
| `ENROLLMENT_TOKEN_EXPIRED` | 400 | The token is past its expiry. |
| `ENROLLMENT_TOKEN_ALREADY_USED` | 409 | The token was already consumed. |
| `AGENT_KEY_NOT_FOUND` | 404 | The server holds no key for this agent DID. |
| `AGENT_ACTIVE_CREDENTIAL_NOT_FOUND` | 404 | The agent has no active credential that fits the request. |
| `CHALLENGE_NOT_FOUND` | 404 | Unknown challenge. |
| `CHALLENGE_EXPIRED` | 410 | The challenge is past its expiry. |
| `CHALLENGE_ALREADY_VERIFIED` | 409 | The challenge was already used. |
| `CHALLENGE_SIGNATURE_INVALID` | 400 | The signature over the nonce does not verify. |
| `JWT_INVALID` / `JWT_EXPIRED` | 400 / 401 | Session token problems. |
| `INSUFFICIENT_SCOPE` | 403 | The verified scopes do not include the one required. |

The full list is in [`src/core/errors/codes.ts`](https://github.com/helixid/helix-core/blob/main/src/core/errors/codes.ts). It also defines codes that the self-hosted routes never return.
