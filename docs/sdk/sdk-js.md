---
id: sdk-js
title: "@helixid/sdk-js"
sidebar_label: "@helixid/sdk-js"
sidebar_position: 1
description: The main HelixID SDK — HelixClient (onboarding, VP signing, delegation, consent grants, verification), VP transport helpers, scope checks and sessions.
---

# `@helixid/sdk-js`

The main SDK. Install it in the agent (to ask HelixID for a signed presentation), in the service (to verify one and to issue consent grants), and in operator tooling.

```bash
npm install @helixid/sdk-js
```

This page describes `@helixid/sdk-js` 0.6.0.

:::note[The package is `@helixid/sdk-js`]
Not `@helixid/sdk`. Earlier planning documents used the shorter name; the published package is `@helixid/sdk-js`.
:::

## The model: the SDK calls the API

Agents and services hold no keys. HelixID generates the keypair when an agent is onboarded or a service is enrolled, and keeps the private key. So onboarding, presenting, delegating, issuing a consent grant and verifying are all HTTP calls made through `HelixClient`:

| Step | Method | API route (self-hosted server) |
| --- | --- | --- |
| Onboard an agent | `client.onboardAgent(enrollmentToken, domains?)` | `POST /v1/onboard` |
| Sign a presentation | `client.signVP(agentDid, serviceDid, { userDid? })` | `POST /v1/agents/:did/vp` |
| Delegate to another agent | `client.delegateAuthority(agentDid, to, scopes, expiresIn, options?)` | `POST /v1/agents/:did/delegate` |
| Enroll a service | `client.createService(input)` | `POST /v1/services` |
| Issue a consent grant | `client.issueServiceDelegationGrant(input)` | `POST /v1/service-delegation-grants` |
| Verify a presentation | `verifyVP(vp, client, options?)` | `POST /v1/vp/verify` |

What stays local is key material an **issuer** owns: key generation, signing, canonical hashing, and `VPBuilder` / `AgentWallet` for an issuer's own keys. See [What `AgentWallet` is still for](#what-agentwallet-is-still-for).

## `HelixClient`

```typescript
import { HelixClient } from '@helixid/sdk-js'

// Self-hosted server: the shared admin key the server was started with.
const client = new HelixClient(process.env.HELIX_API_URL!, {
  adminApiKey: process.env.HELIX_ADMIN_API_KEY!,
})

// Hosted HelixID API: an account API key.
const hosted = new HelixClient({ apiKey: process.env.HELIX_API_KEY! })
```

### Constructor forms

| Form | Use |
| --- | --- |
| `new HelixClient(apiUrl)` | No credential. Enough for routes that need none, such as `resolveDID`, `verifyVP` and `onboardAgent` on a self-hosted server. |
| `new HelixClient(apiUrl, { adminApiKey })` | Self-hosted server. The key is sent as the `x-admin-api-key` header on every call. |
| `new HelixClient({ apiKey })` | An account API key for a hosted HelixID API. No URL is needed; the client uses the hosted API's address. |
| `new HelixClient(apiUrl, { apiKey })` | The same, against a URL you name. An explicit URL always wins. |
| `new HelixClient()` | No API configured. Every API-backed method throws (`SDKOnlyModeNoAPIError` for most). Only the local primitives are usable. |

`apiKey` is sent as `Authorization: Bearer <apiKey>` on every call, and it changes which routes `signVP()` and `delegateAuthority()` call: the account-scoped agent routes rather than the admin-key ones. If both keys are given, `apiKey` is the one sent.

:::caution[`{ adminApiKey }` alone does not select a server]
Only `apiKey` supplies a default URL. `new HelixClient({ adminApiKey })` with no URL has no API configured and its calls throw. Environment variables are not read by the constructor: pass the URL yourself.
:::

### Agents: onboarding, presenting, delegating

| Method | Returns | Purpose |
| --- | --- | --- |
| `onboardAgent(enrollmentToken, domains = [])` | `{ agentDid, vcId }` | Onboard an agent in one call. The server generates and holds the agent's key; no key material comes back. The enrollment token is minted by the agent's owner (console, or `POST /v1/enrollment-tokens`); there is no SDK method for minting it. |
| `signVP(did, targetService, { userDid? })` | `SignedVP` | Have HelixID sign a presentation for the agent. `targetService` is the **DID of the service** the VP is for. The server picks the credentials: every active `HelixAgentCredential` the agent holds, its own and any delegated to it. With `userDid`, it also attaches every active `DelegationGrantCredential` that service issued to this agent for that user; if there is none, the call fails with `CONSENT_GRANT_NOT_FOUND`, meaning the user has not consented yet. |
| `delegateAuthority(did, to, scopes, expiresIn, { vcId?, revokeExisting? })` | `SignedVC` (the delegated credential) | Delegate part of an agent's authority to another agent. `expiresIn` is in seconds. `vcId` pins which of the delegator's active credentials to delegate from. Delegating the same scopes again refreshes the earlier delegation; a different scope set stands beside it; `revokeExisting: true` clears the others. |

```typescript
const { agentDid, vcId } = await client.onboardAgent(enrollmentToken, ['orders.example.com'])

const vp = await client.signVP(agentDid, 'did:web:orders.example.com', {
  userDid: 'did:web:user.example.com', // optional: acting for this user
})
```

### Services and consent grants

A service is enrolled with HelixID, which mints its DID and holds its key. When a user consents, the service's backend asks HelixID to issue the grant in the service's name.

| Method | Returns | Purpose |
| --- | --- | --- |
| `createService({ serviceName, displayName, verifiedDomain, apiEndpoint? })` | `{ serviceDid, serviceName }` | Enroll a service on a self-hosted server. `serviceName` is a short handle, unique per server; `verifiedDomain` is the origin the service is reachable at. |
| `issueServiceDelegationGrant(input)` | `SignedVC` (the grant) | Issue a `DelegationGrantCredential` from `serviceDid` to `agentDid` on `userDid`'s behalf. Built, signed with the service's server-held key and stored with a revocable status entry in one call. Revoke it with `revokeVC(vcId)`. |
| `getAgentScopes({ serviceDid, agentDid })` | `{ agentDid, scopes }` | The scopes the agent holds as itself, from its own active onboarding credentials, never those delegated to it. Grant issuance refuses any scope outside this set, so a consent screen should offer no more. [`@helixid/widget`](./widget.md) uses this. |
| `registerVC(vc)` | `{ vcId, alreadyRegistered }` | Register a credential that was signed outside the platform (typically a grant a service signed with its own key) so the server holds it and can list and revoke it. The server verifies the proof. Idempotent by credential id. |

:::caution[`createService()` and `@helixid/core` 3.0.0 disagree on field names]
`@helixid/sdk-js` 0.6.0 sends `serviceName`, `displayName` and `verifiedDomain`. The `POST /v1/services` route in `@helixid/core` 3.0.0 requires `name`, `domain` and `requiredScopes`, and rejects a request without them. Until the two are aligned, enroll a service by calling the route directly — see [The Two-Issuer Model](../concepts/two-issuer-model.md#services-are-enrolled-identities).
:::

`issueServiceDelegationGrant` input:

| Field | Required | Meaning |
| --- | --- | --- |
| `serviceDid` | Yes | The service granting on the user's behalf: the grant's issuer. |
| `agentDid` | Yes | The agent the user is delegating to: the grant's subject. |
| `userDid` | Yes | The consenting user, recorded as given. |
| `scopes` | Yes | The scopes the user approved. |
| `durability` | No | `standing` (the default, valid for about 10 years) or `session` (24 hours). |
| `revokeExisting` | No | Also revoke every other grant this service holds for the same user and agent. Off by default: a consent with a different scope set is added beside the existing ones, and consenting again to exactly the same scopes refreshes that grant. |
| `allowDelegation` | No | Whether the consent also covers agents this agent delegates to. Omitted, the grant carries no flag and verifiers treat it as allowed. |

```typescript
const grant = await client.issueServiceDelegationGrant({
  serviceDid: 'did:web:helix.example.com:services:orders',
  agentDid,
  userDid: 'did:web:user.example.com',
  scopes: ['read:orders', 'accept-terms'],
  durability: 'standing',
})
```

### Credentials, DIDs, status lists, audit

| Method | Purpose |
| --- | --- |
| `createDID({ subjectType, domains? })` | Generate a keypair locally and register the public key with `POST /v1/dids`. Returns `{ did, keyPair, didDocument, hederaTransactionId }`. Not used for agents, which are onboarded with `onboardAgent`. |
| `resolveDID(did, { live? })` | Resolve a DID through the API. |
| `addServiceEndpoint(did, endpoint)` / `removeServiceEndpoint(did, endpointId)` | Add or remove a DID service endpoint. |
| `deactivateDID(did, reason)` | Deactivate a DID. |
| `issueVC(options)` | Have the platform issuer sign a credential (`POST /v1/vcs`). `expiresInSeconds` defaults to 7,776,000 (90 days). |
| `getVC(vcId)` | Fetch a credential. |
| `listVCs({ subjectDid?, status?, limit? })` | List credential summaries: `vcId`, `subjectDid`, `scopes`, `status`, `issuedAt`, `expiresAt`, `parentVcId?`. |
| `revokeVC(vcId)` | Revoke a credential, including a consent grant or a delegated credential. |
| `renewVC(vcId, { privilegeScopes?, expiresInSeconds? })` | Renew a credential with optional overrides. |
| `checkVCStatus(vc)` | Return `active`, `revoked` or `expired`. |
| `getStatusList(listId)` | Fetch a status list credential. |
| `createStatusList({ listId?, length? })` | Create a status list credential. |
| `getAuditLog({ eventType?, since?, limit? })` | List audit events. |
| `recordConsentGrantedAudit(entry)` | Best-effort `CONSENT_GRANTED` audit write. A no-op unless the client has an `adminApiKey` or `apiKey`; failures are swallowed. `AgentWallet.addCredential()` calls it after storing a grant. |

On a self-hosted server, everything that writes, signs or lists needs the admin key: `createDID`, the service-endpoint and deactivate calls, `issueVC`, `listVCs`, `registerVC`, `revokeVC`, `renewVC`, `createStatusList`, `getAuditLog`, `signVP`, `delegateAuthority`, `createService`, `issueServiceDelegationGrant` and `getAgentScopes`.

### Verification and sessions

| Method | Purpose |
| --- | --- |
| `verifyVP(vp, options?)` | Verify a presentation through `POST /v1/vp/verify`. The standalone `verifyVP(vp, client, options?)` is a thin wrapper over this. |
| `fetchSessionPublicKey()` | Fetch the public key (hex) for API-issued session tokens. |
| `verifySessionToken(token, publicKeyHex)` | Verify an API-issued session token against that key. |
| `requestUserChallenge(userDid)` / `verifyUserChallenge(challengeId, signature)` | Request and answer a user-verification challenge. |

## `verifyVP`

```typescript
import { HelixClient, verifyVP, requireScope, readHelixVPHeader } from '@helixid/sdk-js'

const client = new HelixClient(process.env.HELIX_API_URL!)

const vp = readHelixVPHeader(req.headers)
if (!vp) throw new Error('no presentation')

const result = await verifyVP(vp, client, {
  expectedTargetService: 'did:web:orders.example.com',
})
requireScope(result, 'read:orders')
```

`verifyVP` is an HTTP call to a HelixID API that you choose and trust. That API checks the VP signature, the credential signatures, the delegation chain, expiry, the target service and revocation, and writes `VP_VERIFIED` / `VP_REJECTED` to its audit log. There is no local verification path in the SDK, so a `HelixClient` is required. What verification does not involve is a synchronous call to the *issuer* asking it to vouch for this particular request.

A presentation that fails verification comes back from the API as an error response, which the SDK throws as a typed `HelixError`.

### Options

| Option | Effect |
| --- | --- |
| `expectedTargetService` | Reject a VP not bound to this service. Pass your service's DID. Always set it. |
| `allowSelfSigned` | Accept self-issued credentials. Development only. |

`VerifyVPOptions` also declares `statusListResolver`, but it is not sent to the API and has no effect when verifying through the SDK.

### Result

| Field | Meaning |
| --- | --- |
| `valid` | Whether every cryptographic and validity check passed. Not authorization. |
| `agentDid` | The presenting agent's DID. |
| `privilegeScopes` | The agent credential's ceiling. |
| `effectiveScopes` | **The enforcement field.** Equal to `privilegeScopes` when no consent grant applies; narrowed by the grants in the VP when one does. `checkScope()` and `requireScope()` read this field. See [Authorization & Scopes](../concepts/authorization-and-scopes.md). |
| `vpId` | The presentation ID, for caller-managed replay protection. |
| `delegationChain` | `DelegationLink[]`: `issuer`, `subject`, `vcId`, `scopes`, `delegationDepth` for each link. |
| `targetService` | The service the VP was signed for. |
| `verifiedAt` | When the API verified it. |
| `userDid` | The user the agent is acting for, when the VP names one. |
| `session` | `{ token, expiresAt, publicKeyEndpoint }`, when the verify request asked for a session token. `verifyVP()` in 0.6.0 does not send that flag, so call `POST /v1/vp/verify` with `session: true` directly if you need one. |
| `warning`, `error` | Optional detail from the verifier. |

:::warning[Two things the SDK leaves to you]
**Replay protection** and **the scope requirement**. A presentation is not single-use: neither the API nor the SDK records which `vpId`s have been accepted, so the same VP verifies again until it expires (5 minutes by default) for the service it is bound to. Track consumed `vpId`s in your own store if you need single use; enforcement on the HelixID side is planned. And `valid: true` only says the presentation is genuine: call `requireScope()` for the scope your operation needs. See [Authorization & Scopes](../concepts/authorization-and-scopes.md).
:::

## VP transport helpers

A presentation travels beside the request, never inside tool arguments or a request body. It is always the signed VP as base64url-encoded JSON.

| Export | Purpose |
| --- | --- |
| `HELIX_VP_HEADER` | `'X-Helix-VP'`, the HTTP header name. |
| `HELIX_VP_META_KEY` | `'x-helix-vp'`, the key under an MCP request's `params._meta`. |
| `encodeHelixVP(vp)` | Signed VP to base64url JSON. |
| `decodeHelixVP(value)` | The reverse. Throws `VPInvalidStructureError` if the value is not base64url JSON. |
| `helixVPHeaders(vp)` | `{ 'X-Helix-VP': <encoded VP> }`, ready to spread into `fetch` headers. |
| `readHelixVPHeader(headers)` | Read the VP from the `X-Helix-VP` header (case-insensitive; a `Headers` instance or a plain headers object). `undefined` when absent. |
| `readHelixVPMeta(meta)` | Read the VP from an MCP request's `_meta`. `undefined` when absent. |

```typescript
// Agent side
const vp = await client.signVP(agentDid, 'did:web:orders.example.com')
await fetch('https://orders.example.com/orders/ORD-1001', { headers: helixVPHeaders(vp) })
```

[`@helixid/mcp-middleware`](./mcp.md) additionally accepts `Authorization: HelixVP <vp>`. To send that form, build it yourself: `` `HelixVP ${encodeHelixVP(vp)}` ``. `readHelixVPHeader` reads only `X-Helix-VP`.

## Scopes, sessions, resolver, errors

| Export | Purpose |
| --- | --- |
| `checkScope(result, requiredScope)` | `true` if `result.effectiveScopes` contains the scope. Scopes are compared as exact strings. |
| `requireScope(result, requiredScope)` | Throws `InsufficientScopeError` if it does not. |
| `new SessionManager({ secret, ttl })` | Issue and verify your own HMAC session tokens after a successful verification. See below. |
| `verifyJWT(token, publicKeyHex)` | Verify an API-issued session token locally, given the API's session public key. |
| `new HelixDidResolver({ baseUrl }).resolve(did, { live? })` | Resolve a DID via the HelixID API into a DID Resolution result. |
| `mapApiError(body)` | Convert an API error body into a typed `HelixError`. `HelixClient` does this for you. |
| `AuditEvents` | The audit event-type catalog. |

The package re-exports the `HelixError` classes and the `ErrorCode` catalog, so `error.code` can be matched against the same codes the API returns.

### `SessionManager`

```typescript
const session = new SessionManager({ secret: process.env.JWT_SECRET!, ttl: 600 })

const token = await session.issue({ agentDid: result.agentDid, scopes: result.effectiveScopes })
const claims = await session.verify(token)
```

Signs and verifies JWTs with HMAC (HS256) using a symmetric secret. The constructor requires a secret of at least 16 characters and a positive integer `ttl` in seconds, and throws otherwise.

Use this only when you control all verifiers and can securely store and rotate the secret. For cross-service deployments, prefer API-issued EdDSA tokens — see [Hybrid 3-Layer Design](../architecture/hybrid-layers.md).

## What `AgentWallet` is still for

`AgentWallet` is an encrypted local store for a key, a DID and credentials. It is **not** how agents hold identity: agents have no wallet, and there is no `AgentWallet.create()`. It remains for key material an issuer owns, such as the issuer wallet written by [`helix did create`](./cli.md) and read by the CLI and the [MCP operator server](./mcp-server.md).

```typescript
import { AgentWallet } from '@helixid/sdk-js'

const wallet = await AgentWallet.load('./issuer.enc', process.env.HELIX_WALLET_PASSPHRASE!)
wallet.getDID()
```

The private key is encrypted at rest with AES-256-GCM under a key derived from the passphrase (PBKDF2, SHA-256).

| Member | Purpose |
| --- | --- |
| `AgentWallet.load(path, passphrase, client?, storage?)` | Load an existing wallet. `client` is used only for the best-effort consent audit write. |
| `AgentWallet.credentialFromVC(vcId, vc)` | Build a wallet credential entry from VC JSON. |
| `did` / `getDID()`, `getPublicKey()`, `getPrivateKeyHex()` | Read the loaded identity. |
| `credentials` | The stored credentials, parsed. |
| `sign(data)` | Sign a string or bytes with the wallet key. |
| `save(data, passphrase, locator)` / `load(passphrase, locator)` | Encrypt and write, or read and decrypt, wallet data. |
| `addCredential(vc)` | Store a credential issued to this wallet's DID. Throws `CredentialNotForThisAgentError` or `CredentialAlreadyInWalletError`. |
| `addCredential(vcId, vcJson, path, passphrase)`, `updateCredential(...)`, `removeCredential(vcId, path, passphrase)` | File-level credential edits. |
| `listCredentials(passphrase, path)`, `getCredential(vcId, passphrase, path)`, `getLatestCredential(options, passphrase, path)`, `selectGrant(issuerDid, userDid)` | Read stored credentials. |
| `createDID(subjectType)`, `addService(endpoint)`, `removeService(endpointId)`, `deactivate(reason?)` | Pass-throughs to the attached `HelixClient`. |

A passphrase can be a string or a function returning one, so it can come from a secret manager at the moment it is needed.

Storage is pluggable. `FileWalletStorage` is the default; `PostgresWalletStorage(db, tableName = 'agent_wallets')` stores the encrypted payload in a table instead, and anything implementing `WalletStorage` (`exists`, `save`, `load`) works. The store only ever sees the already-encrypted payload.

## Local signing primitives

For issuers that sign with their own keys.

| Export | Purpose |
| --- | --- |
| `generateKeyPair()`, `signData()`, `verifySignature()`, `publicKeyToMultibase()`, `multibaseToPublicKeyHex()` | Ed25519 key and signature helpers. |
| `createEd25519Proof()`, `verifyEd25519Proof()` | Create and check a linked-data proof on a credential. |
| `hashCanonicalPayload()`, `toCanonicalJson()`, `base58btcEncode()`, `base58btcDecode()` | Canonical JSON and hashing. |
| `buildDIDDocument()` | Build a DID document for a DID and public key. |
| `buildStatusListCredential()`, `createStatusList()`, `getBit()` | Build a BitstringStatusList and read a bit from one. |
| `new VPBuilder({ credentials, holderDid, targetService, userDid? }).sign(privateKeyHex, verificationMethodId)` | Build and sign a VP locally, valid for 5 minutes. `credentials` needs at least one `HelixAgentCredential` and may otherwise contain only `DelegationGrantCredential`s. Only useful to a holder that has its own private key; agents onboarded with `onboardAgent` do not, and use `client.signVP()`. |

## Removed since earlier releases

If you are upgrading, these no longer exist:

| Removed | Use instead |
| --- | --- |
| `HelixClient.enroll`, `requestOnboardingChallenge`, `completeOnboarding` | `client.onboardAgent(enrollmentToken, domains?)` |
| `AgentWallet.create`, `AgentWallet.generateKeypair`, `AgentWallet.fromKeypairAndCredential` | Agents hold no wallet. Issuer wallets are created with `helix did create`. |
| `selfIssueVC` (top level and on `AgentWallet`) | Onboard a real agent against a local server. |
| `delegate(options, wallet)` | `client.delegateAuthority(...)` |
| `issueGrant`, `revokeGrant`, `prepareGrant`, `finalizeGrant` | `client.issueServiceDelegationGrant(...)`, `client.revokeVC(vcId)` |
| `verifyVP(vp, options)` verifying in-process | `verifyVP(vp, client, options)`, an API call |
| `expiresInSeconds` on the verification result | Not returned. |

:::note[The `helixid` server repository lags]
The open-source `helixid` server repository and its examples still pin `@helixid/sdk-js` `^0.4.0` on `main`, so code there may use calls from the left-hand column. This page describes the published 0.6.0 package.
:::
