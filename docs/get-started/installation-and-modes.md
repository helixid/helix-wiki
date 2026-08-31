---
id: installation-and-modes
title: Installation & Modes
sidebar_label: Installation & Modes
sidebar_position: 3
description: Install the SDK, choose a DID method, run the issuer API, and enroll an agent.
---

# Installation & Modes

## Install

```bash
npm install @helixid/sdk-js
```

Framework adapters and operator tooling are separate packages:

```bash
npm install @helixid/mcp        # MCP server + client middleware
npm install @helixid/langchain  # LangChain / LangGraph middleware
npm install @helixid/widget     # SP-side consent widget
npm install -g @helixid/cli     # operator CLI (`helix`)
npm install @helixid/did-hedera # optional Hedera DID resolver
```

The repository itself is a pnpm workspace. To build from source:

```bash
pnpm install
pnpm build
```

## Choosing a mode

HelixID's trust properties are the same in every mode. What changes is **where the verifier gets the issuer's public key from**, and therefore who has to be reachable at verification time.

| Mode | DID method | Key comes from | Needs a running issuer? | Use for |
| --- | --- | --- | --- | --- |
| **Local** | `did:key` | The identifier itself | No | Local development, MCP tool auth, internal agent-to-tool calls |
| **Hosted** (default) | `did:web` | `GET https://<issuer-domain>/.well-known/did.json` | Only to *issue*; not to verify | Production, cross-org trust |
| **Anchored** | `did:hedera` | A public Hedera mirror node | No — the issuer's own domain is never contacted | Ledger-anchored trust, tamper-evident audit |

In all three, verification never calls the issuer to authorize a specific request. See [What "Offline Verification" Actually Means](../concepts/offline-verification.md) and [DIDs & Identity](../concepts/dids-and-identity.md).

### Local mode (`did:key`)

The lowest-friction path — the one the [5-minute quick start](./quick-start.md#5-minute-path-no-infrastructure) uses. `AgentWallet.create()` generates a `did:key` wallet with no API call at all. A `did:key` carries its public key inside the identifier, so there is nothing to resolve and nothing to host.

`did:key` is development-oriented and cannot express key rotation or service endpoints. Use `did:web` or `did:hedera` for production cross-org trust.

### Hosted mode (`did:web`, default)

The issuer serves its own DID document at `/.well-known/did.json`, and verifiers resolve it over HTTPS. This is the default for `helix-api`. Set `DID_METHOD=web` and `DID_DOMAIN` to the domain the API is served from.

### Anchored mode (`did:hedera`)

<span className="helix-badge helix-badge--shipped">Resolver shipped</span> <span className="helix-badge helix-badge--planned">Issuer-side planned</span>

The optional [`@helixid/did-hedera`](../sdk/did-hedera.md) package resolves `did:hedera` DID documents from a public Hedera mirror node, so verification never contacts the issuer's own domain. `helix-core` loads it dynamically when present.

Issuing on Hedera from `helix-api` is not yet available: `.env.example` lists `DID_METHOD` as `web` or `key`, and notes that "support for hedera will be added in future releases." Treat anchored mode today as a **verification/resolution** capability, not an issuance one.

## Running the issuer API

The default runtime needs **no external infrastructure** beyond the API process itself: SQLite storage, in-memory cache, and `did:web`.

Create or update `.env`:

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

Start the API:

```bash
set -a; source .env; set +a
pnpm --filter @helixid/api dev
```

The full variable list is in [Environment & Configuration](../self-hosting/configuration.md).

SQLite mode does not require running database migrations.

### Troubleshooting (SQLite users)

If startup fails with `SyntaxError: The requested module '@prisma/client' does not provide an export named 'PrismaClient'`, it is usually an install/generation/runtime issue — not a SQLite requirement issue.

Regenerate the Prisma client:

```bash
pnpm install
pnpm --filter @helixid/api db:generate
pnpm --filter @helixid/api dev
```

If needed, force a clean reinstall:

```bash
rm -rf node_modules helix-api/node_modules
pnpm install --force
pnpm --filter @helixid/api db:generate
pnpm --filter @helixid/api dev
```

## Enrolling an agent

Onboarding is a single SDK round trip using a one-time **bootstrap token** (single-use, short TTL) delivered out-of-band — an env var, a secret manager, or a CI variable.

```typescript
import { AgentWallet, HelixClient } from '@helixid/sdk-js'

const wallet = await AgentWallet.create('./wallet.enc', process.env.WALLET_PASSPHRASE!)
const client = new HelixClient(process.env.HELIX_API_URL!)

const vc = await client.enroll(process.env.HELIX_BOOTSTRAP_TOKEN!, wallet)

console.log(wallet.did, vc.id)
```

A bootstrap token is **not** an identity credential. It is a one-time permission slip that says: "whoever presents this may enroll one new agent with these scopes/delegation limits/domains."

Creating that token is a privileged **operator policy action** (not an agent action), because it decides authority:

1. Operator decides policy (`requestedScopes`, `maxDelegationDepth`, `requestedDomains`)
2. Operator mints token via `POST /v1/enrollment-tokens` (authenticated operator call)
3. Operator delivers token out-of-band (env var, Kubernetes Secret, CI variable, etc.)
4. Agent SDK presents token via `client.enroll(...)` and receives VC

:::info[Why this boundary exists]
If agents could mint their own bootstrap tokens, identity and authorization would collapse into self-granted authority. The operator owns issuance policy; the agent owns its keys. Neither can do the other's job.
:::

## Present and verify a VP

```typescript
import { AgentWallet, VPBuilder, verifyVP } from '@helixid/sdk-js';

const wallet = await AgentWallet.load('agent/wallet.enc', 'change-this-passphrase');
const credential = wallet.credentials[0];
if (!credential) throw new Error('Wallet has no credential');

const signedVP = await new VPBuilder({
  credentials: [credential],
  holderDid: wallet.getDID(),
  userDid: 'did:web:user.example.com',
  targetService: 'orders-service',
}).sign(wallet.getPrivateKeyHex(), `${wallet.getDID()}#key-1`);

const result = await verifyVP(signedVP, {
  expectedTargetService: 'orders-service',
});

console.log(result.valid, result.agentDid, result.privilegeScopes);
```

`verifyVP()` runs in-process, with no call to the issuer's authorization logic: VP signature, VC signature, validity window, revocation (when `credentialStatus` exists), target-service checks, and delegation-chain integrity. Only DID resolution and the status-list read go over the network, and both are static-document fetches — pass `statusListResolver` to serve the list from your own cache or storage. `vpId` is returned for caller-managed replay protection. If you need a session JWT bridge, call `POST /v1/vp/verify` with `session: true`.

## Delegate authority

```typescript
import { AgentWallet, delegate } from '@helixid/sdk-js';

const wallet = await AgentWallet.load('agent/wallet.enc', 'change-this-passphrase');

const delegatedCredential = await delegate(
  {
    to: 'did:key:z6Mk...delegatee',
    scopes: ['read:analytics'],
    expiresIn: 3600,
    // optional: fromVC: specific issuer-backed parent VC from wallet
  },
  wallet,
);

console.log(
  delegatedCredential.id,
  delegatedCredential.credentialSubject.privilegeScopes,
  delegatedCredential.credentialSubject.delegationDepth,
);
```

Delegation is **Option A**: Agent A signs the child VC locally, and verifiers enforce chain integrity, scope subset, and max depth from the VC chain itself. The parent/root VC must still be issuer-backed; self-issued VCs are only for the quick-start path and are not accepted as a trusted delegation root. There is no API delegation endpoint. See [Delegation & Sub-Delegation](../concepts/delegation.md).
