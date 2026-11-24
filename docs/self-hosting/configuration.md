---
id: configuration
title: Environment & Configuration
sidebar_label: Environment & Configuration
sidebar_position: 2
description: Every environment variable helix-api reads, with defaults and guidance.
---

# Environment & Configuration

`helix-api` is configured entirely through environment variables. The values are validated at startup by the config schema in [`@helixid/core`](../sdk/core.md); an invalid or missing value stops the process with a message naming the variable.

This page describes `@helixid/core` **3.0.0**.

:::note[The server repo's `.env.example` is behind]
The open-source [`helixid`](https://github.com/helixid/helixid) server still pins `@helixid/core` `^2.0.1`, and its `.env.example` describes an older state. Where that file and this page disagree, see [Differences from the server repo's `.env.example`](#differences-from-the-server-repos-envexample).
:::

## How the environment is loaded

At startup the server reads `.env` from the working directory, then `.env.<NODE_ENV>` if `NODE_ENV` is set. A variable that is already set is never overwritten, so real environment variables win over `.env`, and `.env` wins over `.env.<NODE_ENV>`.

The file format is plain `KEY=value` lines. Surrounding quotes are stripped. Lines starting with `#` are ignored. A trailing `# comment` on a value line is **not** stripped, so keep comments on their own lines.

```bash
cp .env.example .env
pnpm dev
```

## Minimum viable configuration

The smallest working setup uses SQLite and `did:key`, and needs no external infrastructure:

```bash
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000

HELIX_STORAGE_ADAPTER=sqlite
DID_METHOD=key

HELIX_SIGNING_KEY=<32-byte-ed25519-private-key-hex>
HELIX_ADMIN_API_KEY=<at-least-16-characters>
HOSTED_KEY_ENCRYPTION_KEY=<64-hex-characters>
```

Two variables have no default and are always required: `HELIX_SIGNING_KEY` and `HELIX_ADMIN_API_KEY`. Three more are required depending on your choices:

| If you use | You must also set |
| --- | --- |
| `DID_METHOD=web` (the default method) | `DID_DOMAIN` |
| `HELIX_STORAGE_ADAPTER=postgres` (the default adapter) | `DATABASE_URL` |
| `HELIX_CACHE_ADAPTER=redis` | `REDIS_URL` |
| `DID_METHOD=hedera` | `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HELIX_ISSUER_DID` |

Set `API_BASE_URL` explicitly. Its built-in default is a placeholder that does not resolve, and the value is written into every credential as the address of its status list.

## API

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production`. Log level is `info` in production and `debug` otherwise. |
| `PORT` | `3000` | 1–65535. The server listens on `0.0.0.0`. |
| `API_BASE_URL` | Unusable placeholder | The public URL of this API. Used to build status-list URLs inside credentials, so verifiers must be able to reach it. |

## DID method

| Variable | Default | Notes |
| --- | --- | --- |
| `DID_METHOD` | `web` | `web`, `key`, or `hedera`. If unset, `HELIX_DID_METHOD` is used; if that is unset too, `web`. |
| `DID_DOMAIN` | None | Required for `web`. The host this API is served from, for example `id.example.com` or `localhost:3000`. |
| `HELIX_ISSUER_DID` | Depends on method | See below. |

What `HELIX_ISSUER_DID` defaults to:

| `DID_METHOD` | When unset | Constraint |
| --- | --- | --- |
| `web` | `did:web:<DID_DOMAIN>` | Must start with `did:web:`. |
| `key` | Derived from `HELIX_SIGNING_KEY` | Leave it unset. If you set it, it must be the `did:key` of that exact key; a mismatch is not caught at startup and shows up later as `VC_SIGNATURE_INVALID` on verification. |
| `hedera` | No default; required | Must look like `did:hedera:<testnet\|previewnet\|mainnet>:…`. |

With `DID_METHOD=web`, agent and user DIDs are `did:web:<DID_DOMAIN>:agents:<slug>` and service DIDs are `did:web:<DID_DOMAIN>:services:<slug>`. The API serves their documents at `/agents/<slug>/did.json` and `/services/<slug>/did.json`, and the issuer's at `/.well-known/did.json`. `DID_DOMAIN` therefore has to be the host verifiers will actually fetch from, over HTTPS in any real deployment.

### Hedera

Used only with `DID_METHOD=hedera`, which also needs the [`@helixid/did-hedera`](../sdk/did-hedera.md) package installed next to the server. It is not a dependency of `@helixid/core`.

| Variable | Default | Notes |
| --- | --- | --- |
| `HEDERA_NETWORK` | `testnet` | `testnet`, `previewnet`, or `mainnet`. `mainnet` is refused unless `NODE_ENV=production`. |
| `HEDERA_OPERATOR_ID` | None | The paying account, for example `0.0.12345`. Required for `hedera`. |
| `HEDERA_OPERATOR_KEY` | None | That account's private key. Required for `hedera`. Every DID creation is a paid transaction. |
| `HEDERA_TOPIC_ID` | Empty | Accepted by the schema. Not read by the server code in 3.0.0. |

## Storage

| Variable | Default | Notes |
| --- | --- | --- |
| `HELIX_STORAGE_ADAPTER` | `postgres` | `sqlite` or `postgres`. |
| `DATABASE_URL` | None | Postgres connection string. Required for `postgres`. |
| `HELIX_SQLITE_PATH` | `./data/helixid.sqlite` | SQLite file. A relative path is resolved against the server package directory, not the working directory. |

The default is `postgres`. If you want the single-file setup, set `HELIX_STORAGE_ADAPTER=sqlite` explicitly; otherwise startup fails asking for `DATABASE_URL`.

SQLite creates its own schema on first run; there is no migration step. To reset, delete the SQLite file and restart. Postgres needs the Prisma migrations applied (`prisma migrate deploy`) before the first start.

As a safety check, a server whose `NODE_ENV` is not `test` refuses to start against a Postgres database whose name contains `test`.

## Signing and admin access

| Variable | Notes |
| --- | --- |
| `HELIX_SIGNING_KEY` | Hex-encoded Ed25519 private key (raw 32 bytes, or PKCS8 DER seed hex) used to sign platform-issued credentials. **This is the trust anchor for your entire domain.** If an issuer DID record already exists and its public key does not match this key, the server refuses to start. |
| `HELIX_ADMIN_API_KEY` | Required, at least 16 characters. Sent as `x-admin-api-key`. Protects credential issue/list/register/revoke/renew, `POST /v1/status-list`, agent VP signing and delegation, service enrollment and consent grants, and every audit-log route. See [HTTP API](../sdk/http-api.md#authentication). |

```bash
openssl rand -hex 32
```

:::danger[Never commit these]
`HELIX_SIGNING_KEY` signs every platform credential in your trust domain. `HELIX_ADMIN_API_KEY` can issue and revoke credentials **and sign presentations on behalf of any agent on the instance**. Keep both out of source control, out of committed env files, and out of logs. The schema enforces 16 characters for the admin key; use at least 32 random characters in any real environment. See the [Security Model](../security/security-model.md).
:::

## Key custody

Agents and services hold no keys. The server generates each agent's and each service's Ed25519 key pair and stores the private key encrypted with AES-256-GCM under one master key.

| Variable | Default | Notes |
| --- | --- | --- |
| `HOSTED_KEY_ENCRYPTION_KEY` | Random per process | The master key: exactly 64 hex characters (32 bytes). |

:::danger[Set this before onboarding anything you want to keep]
If `HOSTED_KEY_ENCRYPTION_KEY` is unset, the server generates a random master key each time it starts. Keys encrypted under the previous process's master key can no longer be decrypted after a restart, so every existing agent can no longer sign a presentation or delegate, and every existing service can no longer issue a consent grant. The rows are still in the database; they are just unreadable. That is acceptable for a throwaway local run and nothing else.

Treat this key like the signing key: generate it once (`openssl rand -hex 32`), store it in a secret manager, back it up, and never change it without a plan to re-onboard. Losing it has the same effect as leaving it unset.
:::

## Tokens and TTLs

| Variable | Default | Bounds | Status in 3.0.0 |
| --- | --- | --- | --- |
| `JWT_SESSION_TTL_SECONDS` | `600` (10 min) | 60–3600 | **Read.** Lifetime of a session token issued by `POST /v1/vp/verify` with `session: true`. |
| `CHALLENGE_TTL_SECONDS` | `300` | 30–600 | Validated, not read. Challenges are valid for a fixed 300 seconds. |
| `ENROLLMENT_TOKEN_TTL_SECONDS` | `900` | 60–3600 | Validated, not read. See below. |
| `VP_TTL_SECONDS` | `300` | 60–3600 | Validated, not read. A presentation expires a fixed 5 minutes after signing. |

Three of these four are still accepted by the schema, so setting them does no harm, but changing them changes nothing:

- **Enrollment tokens** take their lifetime from the request. `POST /v1/enrollment-tokens` accepts an optional `expiry` in whole days. Without it the token never expires.
- **Challenges** and **presentations** use fixed five-minute windows in code.

The session TTL is a security parameter: a longer session means fewer verifications and a longer window in which a revoked credential still gets service. See [Performance & Caching](../architecture/performance-and-caching.md).

## Cache

| Variable | Default | Bounds | Notes |
| --- | --- | --- | --- |
| `HELIX_CACHE_ADAPTER` | `memory` | | `memory` (L1 only) or `redis` (L1 plus a shared L2). |
| `CACHE_ENABLED` | `true` | | `false` turns the API-side DID and status-list caches off entirely. |
| `REDIS_URL` | None | | Required for `redis`. |
| `CACHE_L2_ENABLED` | `true` | | With `redis`, set `false` to keep the configuration but run L1 only. |
| `DID_CACHE_L1_TTL_SECONDS` | `300` | 1–3600 | In-process DID document cache. |
| `DID_CACHE_L2_TTL_SECONDS` | `900` | 1–86400 | Redis DID document cache. |
| `STATUS_LIST_CACHE_L1_TTL_SECONDS` | `60` | 1–3600 | In-process cache of the status list this API serves. |
| `STATUS_LIST_CACHE_L2_TTL_SECONDS` | `300` | 1–86400 | Redis cache of the same. |

The Redis layer is used only when all three hold: `HELIX_CACHE_ADAPTER=redis`, `CACHE_L2_ENABLED=true`, and `REDIS_URL` is set. Revoking a credential or changing a DID evicts the affected entry from both layers on the instance that handled the request. See [Performance & Caching](../architecture/performance-and-caching.md) for what each layer does and what the TTLs trade off.

## Session tokens

Session JWTs are signed with an Ed25519 key pair generated when the API starts, and the public key is served at `GET /v1/sessions/public-key`. Restarting the API rotates it and invalidates outstanding session tokens. With more than one API instance, each has its own key.

The API does not read `JWT_SECRET`. That name belongs to applications using the SDK's HS256 `SessionManager`, which takes its own secret. See [Hybrid 3-Layer Design](../architecture/hybrid-layers.md).

## Audit log

Audit events are always written to the database. These variables control the additional structured-JSON output.

| Variable | Default | Notes |
| --- | --- | --- |
| `AUDIT_LOG_DESTINATION` | `stdout` | `stdout`, `file`, or `both`. |
| `AUDIT_LOG_PATH` | `./data/audit.log` | Used when the destination is `file` or `both`. The directory is created if missing. |

## Local development and testing only

| Variable | Notes |
| --- | --- |
| `DID_WEB_LOOPBACK_RESOLVE_HOST` | When the API resolves a `did:web` whose host is `localhost`, `127.0.0.1`, or `::1`, fetch from this host instead (for example `host.docker.internal`). For Docker demos where "localhost" inside the API container is not the machine the DID lives on. Never set it in production. |
| `HEDERA_MOCK` | `true` swaps in an in-memory Hedera client. Tests only. |
| `HEDERA_E2E_TESTNET` | Default `false`. Allows the end-to-end tests to write to Hedera testnet. **Never `true` in standard CI pipelines.** |

The config schema also defines variables for deployment modes other than the self-hosted server. The self-hosted server does not read them, with one exception: `HOSTED_KEY_ENCRYPTION_KEY`, described above, is used despite its name.

## Differences from the server repo's `.env.example`

The `.env.example` on `main` of the `helixid` server repo was written for an earlier core. Compared with `@helixid/core` 3.0.0:

| `.env.example` says | Core 3.0.0 does |
| --- | --- |
| `DID_METHOD` allows `web` and `key`; Hedera "will be added in future releases". | Accepts `web`, `key`, and `hedera`. |
| Only `sqlite` storage is supported; Postgres is planned. | Supports both, and defaults to `postgres` when the variable is unset. |
| Redis/L2 cache "will be added for future releases"; only L1 TTLs matter. | `HELIX_CACHE_ADAPTER=redis` works, with `REDIS_URL`, `CACHE_L2_ENABLED`, and the two L2 TTLs. |
| Lists `ENROLLMENT_TOKEN_TTL_SECONDS`, `CHALLENGE_TTL_SECONDS`, `VP_TTL_SECONDS` as live settings. | Validates them but does not read them. |
| `AUDIT_LOG_PATH=./logs/audit.log`, "required" for `file`/`both`. | Optional; falls back to `./data/audit.log`. |
| Admin key protects "VC endpoints (issue/revoke/renew)". | It also gates agent VP signing, delegation, service enrollment, consent grants, and the audit log. |
| Does not mention `HOSTED_KEY_ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`, or the `HEDERA_*` variables. | All are read. `HOSTED_KEY_ENCRYPTION_KEY` in particular should be set on any server you intend to restart. |

## Demo environments

The Docker demos in the `helixid` repo have their own `.env.example` files. The LLM settings differ per demo:

| Demo | `LLM_PROVIDER` | `LLM_API_KEY` |
| --- | --- | --- |
| Travel concierge (TypeScript and Python) | `anthropic` (default), `openai`, `azure`, or `gemini` | Required. `azure` also needs `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_VERSION`. |
| Consent demo (TypeScript and Python) | `gemini`, `openai`, or `anthropic` | Optional. With no key the demo runs a scripted planner. |

`LLM_MODEL` is an optional model override. The demos on `main` still target `@helixid/core` `^2.0.1` and `@helixid/sdk-js` `^0.4.0`, and their env files still refer to an agent wallet passphrase from that model. See [Examples](../examples/overview.md).
