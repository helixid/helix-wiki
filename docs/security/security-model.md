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

Three separations do the real work. Each exists because collapsing it puts authority in the wrong hands.

| Boundary | Guarantee | What breaks without it |
| --- | --- | --- |
| **The agent owns its keys** | Private keys are generated in the agent process and encrypted at rest with AES-256-GCM (PBKDF2, 100k iterations, SHA-256, 16-byte salt). They never reach the issuer or verifier. | An issuer that holds agent keys can impersonate any agent it onboarded. |
| **The operator owns issuance policy** | Only an authenticated operator can mint an enrollment token deciding scopes, delegation depth, and domains. | If agents could mint their own bootstrap tokens, identity and authorization would collapse into self-granted authority. |
| **The service provider owns consent** | The SP signs its own grants with its own key and hosts its own status list. | A platform issuer granting consent on the user's behalf, to services it has no relationship with. |

## What `verifyVP()` enforces

1. **VP signature** against the holder's DID public key
2. **VC signature** against the issuer's DID public key
3. **Validity windows** on both the VP and the embedded VC
4. **Revocation**, when the VC carries a `credentialStatus`
5. **Target-service binding** — when you pass `expectedTargetService`
6. **Delegation chain integrity** — signature, scope subsetting, and depth at every hop

## What it deliberately does not enforce

These are the verifier's, because they depend on your storage and your threat model. Getting them wrong is the most likely way a HelixID deployment ends up insecure while every signature checks out.

| Your responsibility | What happens if you skip it |
| --- | --- |
| **Replay protection** | A captured VP can be re-presented until it expires. `verifyVP()` returns `vpId`; you must track consumed IDs. `POST /v1/vp/verify` does this for you. |
| **Passing `expectedTargetService`** | A VP captured by service A can be replayed against service B. |
| **Enforcing on `effectiveScopes`** | Enforcing on `privilegeScopes` grants the agent's ceiling instead of what the user consented to. |
| **Business policy** | `result.valid === true` is not authorization. Verified ≠ trusted. |
| **Leaving `allowSelfSigned` at `false`** | Any agent can self-issue itself unlimited scopes. |

## Key custody

| Key | Held by | Compromise means |
| --- | --- | --- |
| Issuer signing key (`HELIX_SIGNING_KEY`) | The issuer service, never the operator's laptop | An attacker can mint valid credentials for your entire trust domain |
| Admin API key (`HELIX_ADMIN_API_KEY`) | Operator tooling and CI | An attacker can issue and revoke credentials |
| Agent private key | The agent process, encrypted at rest | An attacker can impersonate that one agent until its credential is revoked |
| SP grant signing key | The service provider | An attacker can forge consent grants for that SP |
| Session secret (`JWT_SECRET`, HS256) | Every verifier sharing it | Anyone who can verify a token can also mint one |

That last row is why API-issued EdDSA session tokens are recommended over the SDK's HS256 `SessionManager` for cross-service deployments — a public key cannot forge tokens. See [Hybrid 3-Layer Design](../architecture/hybrid-layers.md).

## Time and staleness

Two windows are configuration, and both are security parameters rather than performance knobs:

- **DID cache TTL** — 5 minutes for `did:web`, 15 for `did:hedera`. Bounds how long a verifier keeps using a rotated key.
- **Status-list cache TTL** — off by default on the verifier side; 60s on the API's serve cache. Bounds use-after-revocation.

Credential expiry checks depend on clock synchronization. Ensure reasonable clock skew across issuers and verifiers.

## Security axioms

The project constitution defines a set of non-negotiable axioms. No user story, implementation shortcut, or external request overrides them, and a pull request that violates one is rejected without exception. They are worth knowing as an operator, because they tell you what the system will never do.

### Key handling

- **Private keys never leave the agent.** The agent's private key is generated locally and stored in its wallet. It is never transmitted to HelixID, never passed to the API, and never logged. VP building and signing execute entirely client-side.
- **HelixID never sees an agent's private key.** Onboarding binds a keypair via a signed bootstrap proof; HelixID receives the agent DID, proof payload metadata, and the signature — never the key.
- **Signed proof of key ownership is required.** No user or agent identity claim is accepted without a cryptographic proof signed by the claimed key holder. There is no password or OTP fallback in the core.

### Tokens and presentations

- **Bootstrap tokens are single-use.** Every token is burned on first use, and a second attempt is rejected regardless of validity. Expiry is short and configurable.
- **VP expiry is enforced.** Expired presentations are rejected at verification regardless of signature validity.
- **VC revocation is checked at verification.** Verifiers check the status list at the index embedded in the VC. A revoked VC invalidates any VP built from it.
- **JWT sessions derive from verified VPs only.** A session may be issued only after full VP verification succeeds and `vpId` has been consumed. Sessions are short-lived, stateless, signed by an API startup-ephemeral Ed25519 keypair whose private key never leaves API memory, and never replace VC or VP issuance semantics.

### Delegation

- **Delegation never increases authority.** A delegated VC may contain only scopes that are a subset of the delegator's active VC scopes. Any scope outside the parent set is rejected.
- **Delegation depth is explicit and enforced.** Root agent VCs default to `maxDelegationDepth = 0` — delegation is impossible unless the agent owner explicitly allows it. Each child increments `delegationDepth`, and delegation fails once it would reach the maximum.
- **Root VCs are signed by the issuer only.** Agents may self-sign delegation VCs granting a subset of their own scopes, but those carry no issuer trust anchor and are validated by chain integrity alone.
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
| VP rejected | `vpId`, `reason` (internal log only — never in the HTTP response), `timestamp` |
| JWT session issued | `jti`, `agentDid`, `userDid`, `targetService`, `vpId`, `expiresAt` |
| JWT session rejected | `jti` or `requestId`, `reason` (internal log only), `timestamp` |
| User DID verified | `userDid`, `timestamp` |
| Status list updated | `listId`, `index`, `newBitValue`, `timestamp` |

### Never logged

- Private keys, agent or issuer
- Raw VC payloads in plaintext
- Raw VP payloads before verification
- Raw JWT session tokens, and the session private key
- Database connection strings
- Bootstrap token raw values after generation — log the `tokenIdHash` only

:::note[Rejection reasons stay internal]
A rejected VP or session logs its reason to the audit trail but does **not** return it in the HTTP response. An error that explains precisely why a presentation failed is a useful oracle for an attacker probing the trust path.
:::

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

HelixID is pre-1.0. Security patches are provided for the **latest minor release only**. A formal supported-versions table will be published at 1.0, once there is at least one stable long-term branch.

| Version | Supported |
| --- | --- |
| Latest minor (`0.x`) | Yes |
| Any earlier release | No — upgrade to the latest minor |

If you run HelixID in production on a pinned older release and need backport guidance, get in touch — see [Reporting a Vulnerability](./reporting-a-vulnerability.md).

## Development-only paths

Two features exist purely for local development and must never be enabled in production:

- **`selfIssueVC()` / `helix vc self-issue`** — carries no issuer-attested authority, and is never accepted as a trusted delegation root.
- **`allowSelfSigned: true`** — makes a verifier accept those credentials. Defaults to `false`; leave it there.

`HEDERA_E2E_TESTNET=true` allows end-to-end tests to write to Hedera testnet, and must never be set in standard CI.
