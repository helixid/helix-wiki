---
id: security-model
title: Security Model
sidebar_label: Security Model
sidebar_position: 1
description: Trust boundaries, key custody, what HelixID enforces, what it leaves to you, and operator best practices.
---

# Security Model

HelixID makes trust decisions on behalf of autonomous software in production systems. This page covers what it guarantees, what it deliberately leaves to you, and what to get right when operating it.

:::note[Scope of this page]
The code repository is the source of truth for threat-model detail. This page covers the architectural security properties a HelixID operator needs to reason about.
:::

## Trust boundaries

| Boundary | Guarantee | What breaks without it |
| --- | --- | --- |
| **The operator owns issuance policy** | Only the operator decides an agent's scopes and delegation depth, through the enrollment token and the admin key. | If agents could set their own scopes, identity and authorization would collapse into self-granted authority. |
| **The service owns consent** | A user's approval is recorded as a grant under the service's own DID, valid only at that service, for that user and that agent. | A platform issuer granting consent on the user's behalf, to services it has no relationship with. |
| **The verifier owns the decision** | Verification returns who is calling and with what scopes. The service decides whether that is enough. | A valid credential being treated as permission for anything. |
| **The issuer is not on the request path** | Verifying a credential from another organization reads that organization's published DID documents and status list. It never asks them whether to allow the request. | Every cross-organization call depending on the caller's identity provider being up and agreeing. |

One boundary HelixID does **not** provide: agents and services do not hold their own private keys. See [Key custody](#key-custody).

## What verification enforces

`verifyVP()` sends the presentation to `POST /v1/vp/verify`, which checks:

1. **Presentation signature and expiry**, against the holder's DID public key
2. **Target-service binding** — when you pass `expectedTargetService`
3. **Each credential's signature**, against its issuer's DID public key
4. **Validity windows** on each credential
5. **Revocation**, for every credential that carries a `credentialStatus`. An unreachable or malformed status list fails closed.
6. **Delegation chain integrity** — linkage, scope subsetting, and depth at every hop, from an issuer-backed root
7. **Consent rules** — a presentation naming a user must carry a grant from the target service for that user and that agent

## What it deliberately does not enforce

These are the verifier's, because they depend on your storage and your threat model. Getting them wrong is the most likely way a HelixID deployment ends up insecure while every signature checks out.

| Your responsibility | What happens if you skip it |
| --- | --- |
| **Replay protection** | A presentation is not single-use: a captured one verifies again until it expires, five minutes after signing. Verification returns `vpId`; track accepted ids yourself if your threat model needs it. Neither the API nor the middleware does this today. |
| **Passing `expectedTargetService`** | A presentation signed for service A is accepted by service B. |
| **Enforcing on `effectiveScopes`** | Enforcing on `privilegeScopes` grants the agent's ceiling instead of what the user consented to. |
| **Business policy** | `result.valid === true` is not authorization. Verified ≠ trusted. |
| **Leaving `allowSelfSigned` at `false`** | A credential whose issuer is its own subject is accepted. |
| **Transport security** | A presentation is a short-lived bearer credential. Send it only over TLS and keep it out of logs. |
| **Trusting the API you verify with** | `verifyVP()` believes whatever API the client points at. Point it at one you run or trust. |

## Key custody

| Key | Held by | Compromise means |
| --- | --- | --- |
| Issuer signing key (`HELIX_SIGNING_KEY`) | The HelixID server | An attacker can mint valid credentials for your entire trust domain |
| Admin API key (`HELIX_ADMIN_API_KEY`) | Operator tooling, and any backend that signs presentations or issues grants | An attacker can issue and revoke credentials, **and sign presentations as any agent** the server onboarded |
| Agent and service private keys | The HelixID server, encrypted at rest with AES-GCM under one master key (`HOSTED_KEY_ENCRYPTION_KEY`) | An attacker holding both the database and that master key can impersonate **every** agent and service in the deployment, not just one |
| Session secret (`JWT_SECRET`, HS256) | Every verifier sharing it | Anyone who can verify a token can also mint one |

:::warning[Set `HOSTED_KEY_ENCRYPTION_KEY`]
If the custody master key is not set, the server generates a random one for the life of the process. Every agent and service key stored under it becomes unreadable after a restart. Set it explicitly, keep it in a secret manager, and back it up separately from the database.
:::

Custody is a deliberate trade. It removes key distribution, storage and rotation from every agent process, and it makes onboarding one call. The cost is the stronger property that only the agent itself could ever sign for it. On a self-hosted server the signing and delegation routes are gated by the single admin key, so anything able to sign for one agent can sign for all of them. Keep that key on the server side of your own backends, never in an agent's prompt, tool configuration or client bundle.

That last row is why API-issued EdDSA session tokens are recommended over the SDK's HS256 `SessionManager` for cross-service deployments — a public key cannot forge tokens. See [Hybrid 3-Layer Design](../architecture/hybrid-layers.md).

## Time and staleness

Two windows are configuration, and both are security parameters rather than performance knobs:

- **DID cache TTL** — 5 minutes for `did:web`, 15 for `did:hedera`. Bounds how long a verifier keeps using a rotated key.
- **Status-list caching and session lifetime** — a status list is served as cacheable for 5 minutes, and a session token minted after verification runs to its own expiry. Together they bound use-after-revocation. See [Revocation](../concepts/revocation.md#cache-staleness-is-the-real-operational-parameter).

Credential expiry is optional: a credential issued without `validUntil` ends only by revocation.

Credential expiry checks depend on clock synchronization. Ensure reasonable clock skew across issuers and verifiers.

## Security axioms

The project holds a set of non-negotiable axioms. No user story, implementation shortcut, or external request overrides them. They are worth knowing as an operator, because they tell you what the system will never do.

### Key handling

- **Agent keys are held in custody by HelixID.** Agent self-custody has been retired. The server generates the agent's keypair during onboarding and stores the private key encrypted at rest; the key is never returned over the API and never logged. Signing a presentation is therefore an API call (`POST /v1/agents/:did/vp`), not a local operation.
- **A private key is never returned to a caller.** Onboarding returns only the agent DID and the id of the credential issued to it. No endpoint discloses key material.
- **Service keys are held the same way.** A service enrolled with HelixID gets a server-generated keypair, used to sign the consent grants it issues.

:::caution[This changed in September 2026]
Earlier versions of HelixID gave each agent its own key and signed presentations client-side, and this page previously stated that private keys never leave the agent. That is no longer true — see [Key custody](#key-custody) for the trade-off.
:::

### Tokens and presentations

- **Enrollment tokens are single-use.** Every token is burned on first use, and a second attempt is rejected. A token does not expire unless it was created with an `expiry` (in days) — set one.
- **VP expiry is enforced.** Expired presentations are rejected at verification regardless of signature validity.
- **VC revocation is checked at verification.** Verifiers check the status list at the index embedded in the VC. A revoked VC invalidates any VP built from it.
- **JWT sessions derive from verified VPs only.** A session may be issued only after full VP verification succeeds. Sessions are short-lived, stateless, signed by an API startup-ephemeral Ed25519 keypair whose private key never leaves API memory, and never replace VC or VP issuance semantics.

### Delegation

- **Delegation never increases authority.** A delegated VC may contain only scopes that are a subset of the delegator's active VC scopes. Any scope outside the parent set is rejected.
- **Delegation depth is explicit and enforced.** Root agent VCs default to `maxDelegationDepth = 0` — delegation is impossible unless the agent owner explicitly allows it. Each child increments `delegationDepth`, and delegation fails once it would reach the maximum.
- **Root VCs are signed by the issuer only.** A delegated credential is signed with the delegating agent's key and is trusted only through its chain back to an issuer-signed root.
- **Consent never increases authority.** A grant may contain only scopes the agent holds in its own right, is valid only at the service that issued it, and covers a sub-agent only when the user allowed delegation.
- **A broken parent breaks the chain.** If any parent or intermediate VC is expired, revoked, missing, tampered with, invalidly signed, or incorrectly linked, the leaf VP fails verification.
- **Self-signed VCs are rejected in production by default.** `verifyVP()` rejects a VC whose issuer equals its `credentialSubject.id` unless `allowSelfSigned: true` is passed explicitly. Framework adapters must never pass it in production.

### Operational

- **Nothing sensitive appears in logs.** Private keys, plaintext VCs, and raw VP payloads before verification must never appear in log output, error messages, or audit entries.
- **No security test may be skipped.** Tests under the security suite may not be marked skip, todo, or `xit`. CI enforces this, and a skipped security test is a build failure.

## Audit log contract

Every security-relevant event must produce an audit entry. This is a correctness requirement on par with tests — a missing entry for one of these events is treated as a bug with the same priority as a failing security test.

### Always logged

| Event | Required fields |
| --- | --- |
| Bootstrap token generated | `tokenIdHash`, `agentName`, `requestedScopes`, `expiresAt` |
| Bootstrap token consumed | `tokenIdHash`, `agentDid`, `timestamp` |
| Bootstrap token rejected | `tokenIdHash`, `reason`, `timestamp` |
| DID deactivated | `did`, `reason`, `timestamp` |
| VC issued | `vcId`, `subjectDid`, `subjectType`, `privilegeScopes`, `expiresAt`, `statusListIndex` |
| VC revoked | `vcId`, `revokedBy`, `timestamp` |
| VC renewed | `oldVcId`, `newVcId`, `timestamp` |
| Challenge issued | `challengeId`, `did`, `purpose`, `expiresAt` |
| Challenge verified | `challengeId`, `did`, `purpose`, `success` |
| Challenge rejected | `challengeId`, `reason`, `timestamp` |
| VP template issued | `vpId`, `agentDid`, `userDid`, `targetService`, `expiresAt` |
| VP verified | `vpId`, `agentDid`, `result`, `timestamp` |
| VP rejected | `vpId`, `reason`, `timestamp` |
| JWT session issued | `jti`, `agentDid`, `userDid`, `targetService`, `vpId`, `expiresAt` |
| JWT session rejected | `jti` or `requestId`, `reason`, `timestamp` |
| User DID verified | `userDid`, `timestamp` |
| Status list updated | `listId`, `index`, `newBitValue`, `timestamp` |

### Never logged

- Private keys, agent or issuer
- Raw VC payloads in plaintext
- Raw VP payloads before verification
- Raw JWT session tokens, and the session private key
- Database connection strings
- Bootstrap token raw values after generation — log the `tokenIdHash` only

A rejected presentation returns its error code to the caller as well as logging it, so a verifier can tell an expired presentation from a revoked credential or a missing consent grant. The codes are listed in the [HTTP API reference](../sdk/http-api.md).

Entries are structured JSON — one single-line object per entry, with an ISO 8601 `timestamp`, an `event`, a `requestId`, and event-specific fields.

## Best practices for operators

The highest-leverage things to get right in production:

- **Key custody.** Never store issuer or agent private keys in plaintext in source control, environment files committed to Git, or logs. Use a KMS, an HSM, or at minimum encrypted-at-rest secret storage with IAM-scoped access.
- **Revocation caches.** Configure reasonable TTLs. Over-aggressive caching leads to use-after-revocation.
- **Policy checks.** Treat authorization rules as security-critical code; review and test them with the same rigor as application logic.
- **Delegation depth.** Set `maxDelegationDepth` explicitly on every credential. The default is conservative; do not disable the check.
- **Clock skew.** Ensure reasonable clock synchronization — credential expiration checks depend on it.
- **Audit ingestion.** Treat audit logs as append-only evidence. Do not rely on a single datastore as the sole audit trail.
- **Subscribe to advisories.** Watch the repository with "Releases and security advisories" enabled, or subscribe to the [Security Advisories feed](https://github.com/helixid/helixid/security/advisories).

## Supported versions

Packages are versioned independently — `@helixid/core` and `helixid-sdk-py` have had major releases, the JavaScript packages are `0.x`. Security patches are provided for the **latest release of each package only**. A formal supported-versions table with long-term branches has not been published yet.

If you run HelixID in production on a pinned older release and need backport guidance, get in touch — see [Reporting a Vulnerability](./reporting-a-vulnerability.md).

## Development-only paths

- **`allowSelfSigned: true`** — makes verification accept a credential whose issuer is its own subject. Defaults to `false`; leave it there. Self-issuing credentials from the SDK and CLI has been removed.
- **`DID_METHOD=key`** — convenient locally because nothing has to be hosted, but a `did:key` cannot rotate. Use `did:web` or `did:hedera` for anything long-lived.

`HEDERA_E2E_TESTNET=true` allows end-to-end tests to write to Hedera testnet, and must never be set in standard CI.
