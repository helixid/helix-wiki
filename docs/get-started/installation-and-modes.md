---
id: installation-and-modes
title: Installation & Modes
sidebar_label: Installation & Modes
sidebar_position: 3
description: Install the SDK, choose a DID method, run the issuer API, and enroll an agent.
---

# Installation & Modes

## Install

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

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

The SDK and its adapters live in [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js), a pnpm workspace. To build from source:

```bash
pnpm install
pnpm build
```

</TabItem>
<TabItem value="py" label="Python">

```bash
pip install helixid-sdk-py
```

Framework adapters are extras on the same package, not separate installs:

```bash
pip install "helixid-sdk-py[langchain]"       # LangChain integration
pip install "helixid-sdk-py[crewai]"          # CrewAI integration
pip install "helixid-sdk-py[mcp-middleware]"  # MCP auth middleware
pip install "helixid-sdk-py[all]"             # everything above
```

There is no Python CLI — the `helix` CLI is deliberately not duplicated per language; see [Project Structure](./project-structure.md#helix-sdk-js).

The SDK lives in [`helix-sdk-py`](https://github.com/helixid/helix-sdk-py). To build from source:

```bash
pip install -e ".[dev,all]"
```

</TabItem>
</Tabs>

## Choosing a mode

HelixID's trust properties are the same in every mode. What changes is **where the verifier gets the issuer's public key from**, and therefore who has to be reachable at verification time.

| Mode | DID method | Key comes from | Needs a running issuer? | Use for |
| --- | --- | --- | --- | --- |
| **Local** | `did:key` | The identifier itself | No | Local development, MCP tool auth, internal agent-to-tool calls |
| **Hosted** (default) | `did:web` | `GET https://<issuer-domain>/.well-known/did.json` | Only to *issue*; not to verify | Production, cross-org trust |
| **Anchored** | `did:hedera` | A public Hedera mirror node | No — the issuer's own domain is never contacted | Ledger-anchored trust, tamper-evident audit |

In all three, verification never calls the issuer to authorize a specific request. See [What "Offline Verification" Actually Means](../concepts/offline-verification.md) and [DIDs & Identity](../concepts/dids-and-identity.md).

### Local mode (`did:key`)

The lowest-friction path — the one the [Fastest path quick start](./quick-start.md#fastest-path-one-running-api) uses. `did:key` carries its public key inside the identifier, so there is nothing to resolve and nothing to host.

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
pnpm dev
```

The full variable list is in [Environment & Configuration](../self-hosting/configuration.md).

SQLite mode does not require running database migrations.

### Troubleshooting (SQLite users)

If startup fails with `SyntaxError: The requested module '@prisma/client' does not provide an export named 'PrismaClient'`, it is usually an install/generation/runtime issue — not a SQLite requirement issue.

Regenerate the Prisma client:

```bash
pnpm install
pnpm db:generate
pnpm dev
```

If needed, force a clean reinstall:

```bash
rm -rf node_modules
pnpm install --force
pnpm db:generate
pnpm dev
```

## Enrolling an agent

Onboarding is a single SDK round trip using a one-time **bootstrap token** (single-use, short TTL) delivered out-of-band — an env var, a secret manager, or a CI variable.

Agent self-custody has been retired: the server generates and holds the agent's private key. There is no wallet file — onboarding returns just a DID and a VC id.

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { HelixClient } from '@helixid/sdk-js'

const client = new HelixClient(process.env.HELIX_API_URL!)

const { agentDid, vcId } = await client.onboardAgent(process.env.HELIX_BOOTSTRAP_TOKEN!)

console.log(agentDid, vcId)
```

</TabItem>
<TabItem value="py" label="Python">

```python
import os
from helix_sdk import HelixClient

client = HelixClient(os.environ["HELIX_API_URL"])

result = client.onboard_agent(os.environ["HELIX_BOOTSTRAP_TOKEN"])

print(result["agentDid"], result["vcId"])
```

</TabItem>
</Tabs>

A bootstrap token is **not** an identity credential. It is a one-time permission slip that says: "whoever presents this may enroll one new agent with these scopes/delegation limits/domains."

Creating that token is a privileged **operator policy action** (not an agent action), because it decides authority:

1. Operator decides policy (`requestedScopes`, `maxDelegationDepth`, `requestedDomains`)
2. Operator mints token via `POST /v1/enrollment-tokens` (open endpoint, no auth required)
3. Operator delivers token out-of-band (env var, Kubernetes Secret, CI variable, etc.)
4. Agent SDK presents token via `onboardAgent()` / `onboard_agent()` and receives its DID + VC id

:::info[Why this boundary exists]
If agents could mint their own bootstrap tokens, identity and authorization would collapse into self-granted authority. The operator owns issuance policy; the agent owns its keys. Neither can do the other's job.
:::

## Present and verify a VP

A server-custody agent has no wallet to load — it presents by asking the API to sign on its behalf, using the `agentDid` returned from onboarding.

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { HelixClient, verifyVP } from '@helixid/sdk-js';

const client = new HelixClient(process.env.HELIX_API_URL!);

const signedVP = await client.signVP(agentDid, 'orders-service');

const result = await verifyVP(signedVP, client, {
  expectedTargetService: 'orders-service',
});

console.log(result.valid, result.agentDid, result.privilegeScopes);
```

</TabItem>
<TabItem value="py" label="Python">

```python
import os
from helix_sdk import HelixClient, verify_vp

client = HelixClient(os.environ["HELIX_API_URL"])

signed_vp = client.sign_vp(agent_did, "orders-service")

result = verify_vp(signed_vp, client, expected_target_service="orders-service")

print(result["valid"], result["agentDid"], result["privilegeScopes"])
```

</TabItem>
</Tabs>

Both calls hit `helix-api`: `signVP()`/`sign_vp()` calls `POST /v1/agents/:did/vp` (the server holds the only copy of the key), and `verifyVP()`/`verify_vp()` calls `POST /v1/vp/verify` — signature check, delegation-chain walk, expiry, target-service check, and revocation all happen server-side, with `VP_VERIFIED`/`VP_REJECTED` audit logging handled there too. `vpId` is returned for caller-managed replay protection. If you need a session JWT bridge, call `POST /v1/vp/verify` directly with `session: true` in the body — the SDK's `verifyVP()`/`verify_vp()` wrapper doesn't expose that flag.

## Delegate authority

For a server-custody agent (the standard path after `onboardAgent()`), delegation is also an API call — the server signs the child VC the same way it signs VPs.

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { HelixClient } from '@helixid/sdk-js';

const client = new HelixClient(process.env.HELIX_API_URL!);

const delegatedCredential = await client.delegateAuthority(
  agentDid,
  'did:key:z6Mk...delegatee',
  ['read:analytics'],
  3600,
);

console.log(
  delegatedCredential.id,
  delegatedCredential.credentialSubject.privilegeScopes,
  delegatedCredential.credentialSubject.delegationDepth,
);
```

</TabItem>
<TabItem value="py" label="Python">

```python
import os
from helix_sdk import HelixClient

client = HelixClient(os.environ["HELIX_API_URL"])

delegated_credential = client.delegate_authority(
    agent_did, "did:key:z6Mk...delegatee", ["read:analytics"], 3600
)

print(
    delegated_credential["id"],
    delegated_credential["credentialSubject"]["privilegeScopes"],
    delegated_credential["credentialSubject"]["delegationDepth"],
)
```

</TabItem>
</Tabs>

Verifiers enforce chain integrity, scope subset, and max depth from the VC chain itself regardless of which path signed it. The parent/root VC must still be issuer-backed. This is the custodial counterpart to the wallet-based `delegate()` shown in [Introduction](./introduction.md#ai-agent) — that one needs the delegator's own private key, so it applies to a self-custody wallet, not a server-custody agent onboarded via `onboardAgent()`. See [Delegation & Sub-Delegation](../concepts/delegation.md).
