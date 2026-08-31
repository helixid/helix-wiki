---
id: configuration
title: Environment & Configuration
sidebar_label: Environment & Configuration
sidebar_position: 2
description: Every environment variable helix-api reads, with defaults and guidance.
---

# Environment & Configuration

`helix-api` is configured entirely through environment variables. Copy `.env.example` and edit it:

```bash
cp .env.example .env
set -a; source .env; set +a
pnpm --filter @helixid/api dev
```

## Minimum viable configuration

The default runtime needs no external infrastructure beyond the API process itself:

```bash
NODE_ENV=development
API_BASE_URL=http://localhost:3000

HELIX_STORAGE_ADAPTER=sqlite
HELIX_SQLITE_PATH=./data/helixid.sqlite
HELIX_CACHE_ADAPTER=memory

DID_METHOD=web
DID_DOMAIN=localhost:3000

HELIX_ADMIN_API_KEY=dev-admin-key-0001
HELIX_SIGNING_KEY=<32-byte-ed25519-private-key-hex>
```

## DID method

| Variable | Default | Notes |
| --- | --- | --- |
| `DID_METHOD` | `web` | Allowed values: `web`, `key`. Hedera issuance is planned for a future release — see [did-hedera](../sdk/did-hedera.md). |
| `DID_DOMAIN` | `localhost:3000` | The domain this API is served from, for `did:web` hosting. |
| `HELIX_ISSUER_DID` | `did:web:${DID_DOMAIN}` | Optional for `DID_METHOD=web`. The issuer DID document must contain the public key derived from `HELIX_SIGNING_KEY`. |

## Storage

| Variable | Default | Notes |
| --- | --- | --- |
| `HELIX_STORAGE_ADAPTER` | `sqlite` | Only `sqlite` is supported today. Postgres is planned. |
| `HELIX_SQLITE_PATH` | `./data/helixid.sqlite` | SQLite DB file path. |

SQLite mode does not require running database migrations.

## Signing and admin access

| Variable | Notes |
| --- | --- |
| `HELIX_SIGNING_KEY` | Hex-encoded Ed25519 private key used to sign VCs. **This is the trust anchor for your entire domain.** |
| `HELIX_ADMIN_API_KEY` | Required. Protects `/v1/vcs` issue/revoke/renew, `/v1/status-list`, `/v1/vcs` listing, and the audit-log routes. |

```bash
openssl rand -hex 32
```

:::danger[Never commit these]
`HELIX_SIGNING_KEY` signs every credential in your trust domain; `HELIX_ADMIN_API_KEY` can issue and revoke them. Keep both out of source control, out of committed env files, and out of logs. Use at least 32 random characters for the admin key in any real environment. See the [Security Model](../security/security-model.md).
:::

## API

| Variable | Default |
| --- | --- |
| `PORT` | `3000` |
| `API_BASE_URL` | `http://localhost:3000` |
| `NODE_ENV` | `development` |

## Tokens and TTLs

Every one of these is a security parameter. See [Performance & Caching](../architecture/performance-and-caching.md).

| Variable | Default | Bounds |
| --- | --- | --- |
| `ENROLLMENT_TOKEN_TTL_SECONDS` | `900` (15 min) | How long a one-time bootstrap token stays usable |
| `CHALLENGE_TTL_SECONDS` | `300` (5 min) | Challenge nonce validity |
| `VP_TTL_SECONDS` | `300` (5 min) | How long a presentation is replayable before expiry |
| `JWT_SESSION_TTL_SECONDS` | `600` (10 min) | Session-token lifetime after one verification |

## Cache

| Variable | Default | Notes |
| --- | --- | --- |
| `HELIX_CACHE_ADAPTER` | `memory` | L1 in-process cache. Redis/L2 is planned. |
| `CACHE_ENABLED` | `true` | Leave enabled unless you explicitly want caching off. |
| `DID_CACHE_L1_TTL_SECONDS` | `300` | Staleness window for a rotated key. |
| `STATUS_LIST_CACHE_L1_TTL_SECONDS` | `60` | Staleness window for a revocation. |

Only the L1 TTLs currently matter. Note that the verifier-side status-list cache is separate and **off by default** — callers inject a `statusListResolver`.

## Session tokens

Session JWTs are signed with an **API startup-ephemeral** Ed25519 keypair, and the public key is served at `GET /v1/sessions/public-key`. Restarting the API rotates it.

`JWT_SECRET` is only relevant to the SDK's HS256 `SessionManager`, not to API-issued EdDSA tokens. A missing `JWT_SECRET` has no effect on verifying API-issued session tokens, but it will prevent constructing a `SessionManager`. See [Hybrid 3-Layer Design](../architecture/hybrid-layers.md).

## Audit log

| Variable | Default | Notes |
| --- | --- | --- |
| `AUDIT_LOG_DESTINATION` | `stdout` | Allowed values: `stdout`, `file`, `both`. |
| `AUDIT_LOG_PATH` | `./logs/audit.log` | Required only when the destination is `file` or `both`. |

## Testing only

| Variable | Default | Notes |
| --- | --- | --- |
| `HEDERA_E2E_TESTNET` | `false` | Allows E2E tests to write to Hedera testnet. **Never `true` in standard CI pipelines.** |

## Demo environments

The two Docker demos have their own `.env.example` files. Demo B additionally needs:

```bash
LLM_PROVIDER=anthropic # anthropic (default) | openai | azure
LLM_API_KEY=your-provider-key
```

See [Examples](../examples/overview.md).
