---
id: sdk-js
title: "@helixid/sdk-js"
sidebar_label: "@helixid/sdk-js"
sidebar_position: 1
description: The main HelixID SDK — AgentWallet, VPBuilder, verifyVP, delegate, HelixClient, SessionManager.
---

# `@helixid/sdk-js`

The main SDK. Install it in the agent (to hold a wallet and sign presentations) and in the verifier (to check them).

```bash
npm install @helixid/sdk-js
```

:::note[The package is `@helixid/sdk-js`]
Not `@helixid/sdk`. Earlier planning documents used the shorter name; the published package is `@helixid/sdk-js`.
:::

## `HelixClient`

API-backed client. Construct with no arguments for SDK-only mode, or with an API base URL and optional `{ adminApiKey }`.

```typescript
import { HelixClient } from '@helixid/sdk-js'

const client = new HelixClient(process.env.HELIX_API_URL!)
```

| Method | Purpose |
| --- | --- |
| `createDID(options)` | Generate a keypair and call `POST /v1/dids`. |
| `resolveDID(did, options?)` | Resolve a DID through the API, optionally live. |
| `addServiceEndpoint(did, endpoint)` | Add a DID service endpoint. |
| `removeServiceEndpoint(did, endpointId)` | Remove a DID service endpoint. |
| `deactivateDID(did, reason)` | Deactivate a DID. |
| `issueVC(options)` | Issue a VC through the API. |
| `getVC(vcId)` | Fetch VC details. |
| `listVCs(filters?)` | List VC summaries through the API. |
| `revokeVC(vcId)` | Revoke a VC through the API. |
| `renewVC(vcId, overrides?)` | Renew a VC with optional scope/expiry overrides. |
| `getStatusList(listId)` | Fetch a status list credential. |
| `createStatusList(options?)` | Create or replace the active status list credential. |
| `getAuditLog(filters?)` | List API audit events. |
| `verifyVP(vp, options?)` | Verify a VP locally and, when API credentials are configured, record `VP_VERIFIED` / `VP_REJECTED` audit entries. |
| `checkVCStatus(vc)` | Return `active`, `revoked`, or `expired`. |
| `fetchSessionPublicKey()` | Fetch the public key for API-issued session JWTs. |
| `verifySessionToken(token, publicKeyHex)` | Verify an API session token locally. |
| `enroll(bootstrapToken, wallet)` | Direct enrollment using the wallet DID and signature; stores the returned VC. |
| `requestOnboardingChallenge(token, domains?)` | Start two-step onboarding and hold the pending keypair. |
| `completeOnboarding(challengeId, nonce, passphrase, path)` | Sign the challenge, verify onboarding, and save the wallet. |
| `requestUserChallenge(userDid)` | Request a user verification challenge. |
| `verifyUserChallenge(challengeId, signature)` | Verify a user challenge signature. |

Methods that hit admin-protected routes (`issueVC`, `revokeVC`, `renewVC`, `createStatusList`, `getAuditLog`, `listVCs`) require the client to be constructed with an `adminApiKey`.

## `AgentWallet`

Local encrypted wallet and credential store. Private keys are generated in-process and encrypted at rest with AES-256-GCM; they never leave the agent.

```typescript
import { AgentWallet } from '@helixid/sdk-js'

const wallet = await AgentWallet.create('./wallet.enc', process.env.WALLET_PASSPHRASE!)
```

| Method | Purpose |
| --- | --- |
| `credentials` | Getter returning parsed signed VCs. |
| `did` / `getDID()` | Return the wallet DID. |
| `getPublicKey()` | Return the public key hex. |
| `getPrivateKeyHex()` | Return the private key hex in memory. |
| `createDID(subjectType)` | Create a DID through the attached `HelixClient`. |
| `addService(endpoint)` | Add a service endpoint for the wallet DID. |
| `removeService(endpointId)` | Remove a service endpoint for the wallet DID. |
| `deactivate(reason?)` | Deactivate the wallet DID through the client. |
| `sign(data)` | Sign a string or bytes with the wallet key. |
| `save(data, passphrase, filePath)` | Encrypt and write the wallet file. |
| `load(passphrase, filePath)` | Decrypt wallet data. |
| `getPrivateKey(passphrase, filePath)` | Load and return the private key. |
| `addCredential(vc)` / `addCredential(vcId, vcJson, path, passphrase)` | Add a VC to the in-memory or file wallet. |
| `selfIssueVC(options)` | Create and store a self-signed dev credential. |
| `updateCredential(vcId, vcJson, path, passphrase)` | Replace a stored credential. |
| `removeCredential(vcId, path, passphrase)` | Remove a stored credential. |
| `listCredentials(passphrase, path)` | List stored credential metadata. |
| `getCredential(vcId, passphrase, path)` | Fetch one stored credential metadata entry. |
| `getLatestCredential(options, passphrase, path)` | Fetch the latest credential, optionally by VC type. |

Static constructors:

| Method | Purpose |
| --- | --- |
| `AgentWallet.create(path, passphrase)` | Load a wallet, or create a new `did:key` wallet file. |
| `AgentWallet.load(path, passphrase)` | Load a wallet as an `AgentWallet` instance. |
| `AgentWallet.generateKeypair()` | Generate a local keypair without creating a DID. |
| `AgentWallet.fromKeypairAndCredential(keypair, vc)` | Build an ephemeral in-memory wallet from a keypair and VC. |
| `AgentWallet.credentialFromVC(vcId, vc)` | Build wallet metadata from VC JSON. |

## VP, delegation, scopes, sessions, resolver

| Export | Purpose |
| --- | --- |
| `new VPBuilder({ credentials, holderDid, targetService, userDid? }).sign(privateKeyHex, verificationMethodId)` | Build and sign a short-lived VP for a target service. `credentials` carries 1–2 entries: exactly one agent-authority VC, plus at most one consent grant VC. `userDid` is optional; when omitted, `delegatedBy` is absent from the payload. |
| `verifyVP(vp, options?)` | Verify VP signature, VC signature, expiry, revocation, target service, and delegation chain. |
| `delegate(options, wallet)` | Create a delegated VC from a wallet credential with scoped-down privileges. |
| `checkScope(result, requiredScope)` | Boolean scope check on a `VerifyVPResult`. |
| `requireScope(result, requiredScope)` | Throw if the required scope is missing. |
| `new SessionManager({ secret, ttl }).issue(input)` | Issue an HMAC session JWT from a verified agent/scopes. |
| `SessionManager.verify(token)` | Verify a session JWT and return its claims. |
| `new HelixDidResolver({ baseUrl }).resolve(did, options?)` | Resolve a DID via the HelixID API into a DID Resolution result. |
| `mapApiError(body)` | Convert an API error response into an SDK `HelixError`. |
| `selfIssueVC(options, wallet)` | Create a self-signed development credential. |

### `verifyVP` options

| Option | Effect |
| --- | --- |
| `expectedTargetService` | Reject a VP not bound to this service. Always pass it. |
| `allowSelfSigned` | Accept self-issued credentials. Defaults to `false`. Development only. |
| `statusListResolver` | Serve the revocation status list from your own cache, CDN, or storage instead of fetching it per verification. |

### `VerifyVPResult` fields in common use

| Field | Meaning |
| --- | --- |
| `valid` | Whether every cryptographic and validity check passed. Not authorization. |
| `agentDid` | The presenting agent's DID. |
| `privilegeScopes` | The agent credential's ceiling. |
| `effectiveScopes` | **The enforcement field.** Equal to `privilegeScopes` unless a consent grant was presented, in which case it is the intersection. |
| `vpId` | The presentation ID, for caller-managed replay protection. |
| `expiresInSeconds` | Remaining VP lifetime — a natural TTL for a session or result cache. |

:::warning[Two things the SDK leaves to you]
**Replay protection** and **the scope requirement**. `verifyVP()` returns `vpId` and stops; you must track consumed IDs against your own store. See [Authorization & Scopes](../concepts/authorization-and-scopes.md).
:::

## `SessionManager`

```typescript
const session = new SessionManager({ secret: process.env.JWT_SECRET!, ttl: 600 });
```

Signs and verifies JWTs with HMAC (HS256) using a symmetric secret. The constructor requires a secret of at least 16 characters and throws `SessionManager secret must be at least 16 characters` otherwise.

Use this only when you control all verifiers and can securely store and rotate the secret. For cross-service deployments, prefer API-issued EdDSA tokens — see [Hybrid 3-Layer Design](../architecture/hybrid-layers.md).
