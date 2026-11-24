---
id: sdk-py
title: "helixid-sdk-py"
sidebar_label: Python SDK
sidebar_position: 2
description: The HelixID Python SDK — HelixClient, verify_vp, SessionManager, VP transport helpers, and the LangChain, CrewAI and MCP middleware packages.
---

# `helixid-sdk-py`

The Python SDK. One distribution, four import packages. Install it in the agent (to request presentations) and in the verifier (to check them). This page describes version 2.1.0.

```bash
pip install helixid-sdk-py
```

| Install | Adds | Python |
| --- | --- | --- |
| `pip install helixid-sdk-py` | `helix_sdk` (depends on `pynacl`, `cryptography`, `requests`) | 3.9+ |
| `pip install "helixid-sdk-py[langchain]"` | `langchain-core>=0.3` for `helix_langchain` | 3.10+ |
| `pip install "helixid-sdk-py[crewai]"` | `crewai>=1.0` for `helix_crewai` | 3.10+ |
| `pip install "helixid-sdk-py[mcp-middleware]"` | `mcp>=1.9,<2` (the MCP Python SDK) | 3.10+ |
| `pip install "helixid-sdk-py[all]"` | All three of the above | 3.10+ |

:::note[The extras need Python 3.10]
The base package supports Python 3.9. Each extra's dependency carries a `python_version >= '3.10'` marker, so on 3.9 the extra installs nothing and importing `helix_langchain` or `helix_crewai` raises `ImportError`.
:::

| Import package | Purpose |
| --- | --- |
| `helix_sdk` | `HelixClient`, `verify_vp`, scope checks, `SessionManager`, VP transport helpers, errors. |
| `helix_langchain` | LangChain tool wrapper and scope filter. |
| `helix_crewai` | CrewAI tool wrapper and scope filter. See [CrewAI](../integrations/crewai.md). |
| `helix_mcp_middleware` | Gate for MCP servers: HelixID VPs or OAuth bearer tokens, per-tool scopes, audit. |

The SDK is synchronous (built on `requests`). Agents hold no keys: onboarding, signing a presentation and delegating are all API calls. There is no Python CLI; use the CLI from the JavaScript SDK.

## `HelixClient`

Every method is an HTTP call to a HelixID API. API errors are raised as typed `HelixError` subclasses with `code`, `message` and `http_status`.

```python
import os
from helix_sdk import HelixClient

client = HelixClient(os.environ["HELIX_API_URL"], admin_api_key=os.environ["HELIX_ADMIN_API_KEY"])
```

The constructor is `HelixClient(base_url=None, admin_api_key=None, api_key=None)`.

| Call | Mode |
| --- | --- |
| `HelixClient()` | SDK-only. Every API method raises `SDKOnlyModeNoAPIError`. |
| `HelixClient(base_url)` | A self-hosted HelixID API, unauthenticated routes only. |
| `HelixClient(base_url, admin_api_key=...)` | Self-hosted, with the admin key sent as `x-admin-api-key`. Needed for signing, delegation, issuance and revocation. |
| `HelixClient(api_key=...)` | An account API key for a hosted HelixID API, sent as a bearer token. `base_url` defaults to the hosted API when omitted; pass it to override. |

`HELIX_API_URL` is not read from the environment (since 1.0.0); pass the URL yourself.

### Agents

| Method | Purpose |
| --- | --- |
| `onboard_agent(enrollment_token, domains=None)` | `POST /v1/onboard`. The server generates and keeps the agent's key. Returns `{agentDid, vcId}`. |
| `sign_vp(did, target_service, user_did=None)` | `POST /v1/agents/:did/vp`. Returns the signed VP. `target_service` is the service's DID. |
| `delegate_authority(did, to, scopes, expires_in, vc_id=None, revoke_existing=False)` | `POST /v1/agents/:did/delegate`. Returns the delegated credential. |

The enrollment token must already exist. It is created by the agent's owner with `POST /v1/enrollment-tokens`; the SDK has no method for it.

```python
onboarding = client.onboard_agent(enrollment_token, ["https://agent.example.com"])
agent_did = onboarding["agentDid"]

vp = client.sign_vp(agent_did, service_did)                          # agent acting as itself
vp = client.sign_vp(agent_did, service_did, user_did="did:web:user.example.com")  # on a user's behalf
```

The server picks the credentials. A presentation carries every active `HelixAgentCredential` the agent holds, its own and any delegated to it. With `user_did`, the server also attaches every active `DelegationGrantCredential` that service issued to this agent for that user; if there is none, the call raises an error with code `CONSENT_GRANT_NOT_FOUND`.

```python
delegated_vc = client.delegate_authority(
    agent_did,
    to=sub_agent_did,
    scopes=["orders:read"],
    expires_in=3600,
)
```

Delegating the same scopes again refreshes the earlier delegation; a different scope set stands beside it unless `revoke_existing=True`. `vc_id` pins which of the delegator's active credentials to delegate from. See [Delegation](../concepts/delegation.md).

### Services and consent grants

| Method | Purpose |
| --- | --- |
| `create_service(service_name, display_name, verified_domain, api_endpoint=None)` | `POST /v1/services`. Enrolls a service on a self-hosted server (admin key). Returns `{serviceDid, serviceName}`. |
| `get_agent_scopes(service_did, agent_did)` | `GET /v1/service-delegation-grants/agent-scopes`. The scopes the agent holds as itself, for the consent screen. Returns `{"agentDid": ..., "scopes": [...]}`. |
| `issue_service_delegation_grant(service_did, agent_did, user_did, scopes, durability="standing", revoke_existing=False, allow_delegation=None)` | `POST /v1/service-delegation-grants`. Returns the grant credential. |
| `register_vc(vc)` | `POST /v1/vcs/register`. Registers a grant signed outside the platform (legacy path). Returns `{vcId, alreadyRegistered}`. |

```python
offered = client.get_agent_scopes(service_did, agent_did)["scopes"]

grant = client.issue_service_delegation_grant(
    service_did,
    agent_did,
    user_did="did:web:user.example.com",
    scopes=["orders:read"],
    durability="session",
)
```

HelixID builds the `DelegationGrantCredential`, signs it with the service's key that it holds, and stores it with a revocable status entry. `scopes` may only contain scopes the agent was onboarded with. `allow_delegation` says whether the consent also covers agents this agent delegates to; left as `None`, the grant carries no flag, which verifiers treat as allowed. The caller does not need to keep the returned credential: `sign_vp()` finds every active grant for the user, agent and service. Revoke one with `revoke_vc()`. See [Two-Issuer Model](../concepts/two-issuer-model.md).

### Verification and sessions

| Method | Purpose |
| --- | --- |
| `verify_vp(vp, expected_target_service=None, allow_self_signed=None)` | `POST /v1/vp/verify`. Returns the verification result. |
| `fetch_session_public_key()` | `GET /v1/sessions/public-key`. Returns the public key hex for API-issued session JWTs. |
| `verify_session_token(token, public_key_hex)` | Verify an API-issued session JWT against that key. |
| `request_user_challenge(user_did)` | `POST /v1/challenges` with purpose `user_verification`. |
| `verify_user_challenge(challenge_id, signature)` | `POST /v1/challenges/:id/verify`. |

### DIDs, credentials, status lists, audit

| Method | Purpose |
| --- | --- |
| `create_did(subject_type, domains=None)` | Generate a keypair locally and call `POST /v1/dids`. Returns `did`, `didDocument`, `hederaTransactionId`, `keyPair`. |
| `resolve_did(did, live=False)` | Resolve a DID through the API. |
| `add_service_endpoint(did, endpoint)` | Add a DID service endpoint. |
| `remove_service_endpoint(did, endpoint_id)` | Remove a DID service endpoint. |
| `deactivate_did(did, reason)` | Deactivate a DID. |
| `issue_vc(**options)` | `POST /v1/vcs`. `expiresInSeconds` defaults to `7_776_000` (90 days). |
| `get_vc(vc_id)` | Fetch VC details. |
| `list_vcs(subject_did=None, status=None, limit=None)` | List VC summaries. |
| `revoke_vc(vc_id)` | `POST /v1/vcs/:vcId/revoke`. |
| `renew_vc(vc_id, privilege_scopes=None, expires_in_seconds=None)` | Renew a VC with optional overrides. |
| `check_vc_status(vc)` | Returns the status string from `GET /v1/vcs/:vcId/status`. |
| `get_status_list(list_id)` | Fetch a status list credential. |
| `create_status_list(**options)` | `POST /v1/status-list`. |
| `get_audit_log(event_type=None, since=None, limit=None)` | List audit events. |
| `record_consent_granted_audit(**entry)` | Best-effort `CONSENT_GRANTED` audit write. Never raises. |

## `verify_vp`

```python
from helix_sdk import HelixClient, verify_vp, require_scope

client = HelixClient(os.environ["HELIX_API_URL"])

result = verify_vp(vp, client, expected_target_service=service_did)
require_scope(result, "orders:read")
```

`verify_vp(vp, client, expected_target_service=None, allow_self_signed=None)` calls `client.verify_vp()`, which is a `POST /v1/vp/verify` request to the HelixID API the verifier chose. The SDK has no local verification path, so a `HelixClient` with a base URL is required. What verification avoids is a synchronous call to the *issuer* asking it to vouch for the request.

| Option | Effect |
| --- | --- |
| `expected_target_service` | Reject a VP not bound to this service's DID. Always pass it. |
| `allow_self_signed` | Accept self-issued credentials. Development only. |

A credential that fails verification usually surfaces as a raised `HelixError` with a specific `code` (for example `VC_REVOKED`), not as `valid: False`. Handle both.

The result is the API response as a `dict`, with the API's camelCase keys.

| Key | Meaning |
| --- | --- |
| `valid` | Whether every cryptographic and validity check passed. Not authorization. |
| `agentDid` | The presenting agent's DID. |
| `privilegeScopes` | The agent credential's ceiling. |
| `effectiveScopes` | **The enforcement field.** Computed by the verifier from the agent credentials and any consent grants in the VP. |
| `vpId` | The presentation ID, for caller-managed replay protection. |
| `delegationChain`, `targetService`, `verifiedAt` | The chain that was walked, the service the VP was bound to, and when it was checked. |
| `userDid`, `session`, `warning`, `error` | Present when they apply. |

| Helper | Purpose |
| --- | --- |
| `check_scope(result, required_scope)` | `True` when `required_scope` is in `result["effectiveScopes"]`. |
| `require_scope(result, required_scope)` | Raises `InsufficientScopeError` (code `INSUFFICIENT_SCOPE`, status 403) otherwise. |

:::warning[Two things the SDK leaves to you]
**Replay protection** and **the scope requirement**. A VP is not single-use: it lives for five minutes and is bound to one target service, and neither the API nor the SDK tracks consumed `vpId`s. Track them in your own store if you need single use. See [Authorization & Scopes](../concepts/authorization-and-scopes.md).
:::

## `SessionManager`

```python
from helix_sdk import SessionManager

sessions = SessionManager(secret=os.environ["JWT_SECRET"], ttl=600)

token = sessions.issue(result["agentDid"], result["effectiveScopes"], result.get("delegationChain"))
claims = sessions.verify(token)   # {"agentDid", "scopes", "delegationChain", "iat", "exp", "jti"}
```

A verifier-owned session token, signed with HMAC (HS256) using a symmetric secret. Mint one after a successful `verify_vp()` so later calls from the same agent can skip re-verification until it expires. Nothing here talks to the API.

- `SessionManager(secret, ttl)` raises `ValueError` when the secret is shorter than 16 characters or `ttl` is not a positive integer (seconds).
- `issue(agent_did, scopes, delegation_chain=None)` returns the token.
- `verify(token)` returns the claims and raises `ValueError` on a bad signature, an unsupported header or an expired token.

Use this only when you control every verifier and can store and rotate the secret. A session outlives revocation checks for as long as its `ttl`, so keep it short.

## VP transport

A signed VP travels as base64url-encoded JSON. It never goes in tool arguments or a request body.

| Export | Purpose |
| --- | --- |
| `HELIX_VP_HEADER` | `"X-Helix-VP"`. |
| `HELIX_VP_META_KEY` | `"x-helix-vp"`, the key inside an MCP request's `params._meta`. |
| `encode_helix_vp(vp)` | VP `dict` to base64url string. |
| `decode_helix_vp(value)` | Base64url string to VP `dict`. Raises `VPInvalidStructureError` on bad input. |
| `helix_vp_headers(vp)` | `{"X-Helix-VP": <encoded VP>}`, ready to pass as request headers. |
| `read_helix_vp_header(headers)` | Read and decode the `X-Helix-VP` header (case-insensitive). `None` when absent. |
| `read_helix_vp_meta(meta)` | Read and decode `_meta["x-helix-vp"]`. `None` when absent. |

```python
import requests
from helix_sdk import helix_vp_headers, read_helix_vp_header

requests.get(orders_url, headers=helix_vp_headers(vp))        # agent side

vp = read_helix_vp_header(request.headers)                     # service side
```

:::note[`Authorization: HelixVP` in Python]
The MCP middleware below also accepts `Authorization: HelixVP <vp>`. The `helix_sdk` helpers send and read the `X-Helix-VP` header only; to use the `Authorization` form outside the middleware, build the header with `encode_helix_vp()` and parse it with `decode_helix_vp()`.
:::

## Local signing primitives

Agents do not use these. They remain for other actors that sign with their own keys.

| Export | Purpose |
| --- | --- |
| `generate_key_pair()`, `derive_public_key()`, `sign_data()`, `verify_signature()`, `public_key_to_multibase()`, `multibase_to_public_key_hex()`, `KeyPair` | Ed25519 key and signature helpers. |
| `VPBuilder(credentials, holder_did, target_service, user_did=None).sign(private_key_hex, verification_method_id)` | Build and sign a five-minute VP locally. Needs at least one `HelixAgentCredential`; anything else must be a `DelegationGrantCredential`. |
| `AgentWallet`, `WalletCredential` | Encrypted key file and credential store. Not part of agent onboarding. |
| `HelixError`, `map_api_error(body)`, `codes` | Error base class, API error mapping, and the error code constants. |

## `helix_langchain`

```bash
pip install "helixid-sdk-py[langchain]"
```

| Export | Purpose |
| --- | --- |
| `helix_id_tool_wrapper(tool, client, agent_did, target_service, user_did=None)` | Wrap a `langchain_core.tools.BaseTool`. Each call signs a fresh VP with `client.sign_vp()`, then runs the original tool's `_run` with its arguments unchanged. |
| `current_helix_vp_headers()` | Inside a wrapped call: `{"X-Helix-VP": <encoded VP>}`. Outside one: `{}`. |
| `filter_tools_by_scope(tools, client, agent_did)` | Drop tools whose required scope the agent does not hold. |
| `HelixIDCallbackHandler(client, agent_did, target_service, user_did=None)` | A callback handler kept for observability. It attaches no VP. |

```python
import requests
from langchain_core.tools import tool
from helix_langchain import helix_id_tool_wrapper, current_helix_vp_headers

@tool
def lookup_order(order_id: str) -> str:
    """Look up an order by id."""
    res = requests.get(f"{ORDERS_API}/orders/{order_id}", headers=current_helix_vp_headers())
    return res.text

protected = helix_id_tool_wrapper(lookup_order, client, agent_did, service_did)
```

The VP is held in a context variable for the duration of the call, so it stays out of the tool's input and out of the model's view.

`filter_tools_by_scope` reads the required scope from `tool.metadata["requiredScope"]` (or `"required_scope"`), then from a `required_scope` attribute. A tool with neither is kept. The agent's scopes come from one `list_vcs(subject_did=agent_did, status="active")` call.

:::note[Filter first, then wrap]
The wrapper copies the tool's `name`, `description` and `args_schema` only. Run `filter_tools_by_scope` on the original tools and wrap what is left; a wrapped tool no longer carries the scope metadata, so the filter would keep it. Filtering is a convenience for the model, not a security boundary: the service still verifies the VP and enforces scopes.
:::

## `helix_mcp_middleware`

```bash
pip install "helixid-sdk-py[mcp-middleware]"
```

A gate for MCP servers. Call it for every incoming tool call. It identifies the caller, checks the tool's scopes, records the decision, and returns the call or raises. Tool arguments are never read.

| Export | Purpose |
| --- | --- |
| `helixid_mcp_middleware(options)` | Returns a sync gate: `gate(tool_call) -> tool_call`. |
| `async_helixid_mcp_middleware(options)` | The same gate as a coroutine. The blocking check runs in a worker thread; `validate_oauth_token`, `audit_sink` and `on_audit_error` may be sync or async. |
| `attach_helix_vp(tool_call, options)` | Client side: sign a VP and put it in the call's `_meta["x-helix-vp"]`. |

```python
from helix_sdk import HelixClient
from helix_mcp_middleware import MCPMiddlewareOptions, async_helixid_mcp_middleware

gate = async_helixid_mcp_middleware(MCPMiddlewareOptions(
    client=HelixClient(os.environ["HELIX_API_URL"]),
    expected_target_service=os.environ["SERVICE_DID"],
    tool_scopes={
        "lookup_order": ["orders:read"],
        "refund_order": ["orders:admin"],
    },
))

await gate({
    "name": params["name"],
    "input": params.get("arguments", {}),
    "_meta": params.get("_meta"),
    "headers": request.headers,
})
```

A tool call is a `dict` with `name` and `input`, plus `_meta` (the MCP request's `params._meta`) and, over HTTP, `headers`.

### Credentials

| Where | Credential |
| --- | --- |
| `Authorization: HelixVP <vp>` | HelixID VP |
| `X-Helix-VP: <vp>` (legacy header) | HelixID VP |
| `params._meta["x-helix-vp"]` (any transport, including stdio) | HelixID VP |
| `Authorization: Bearer <token>` | OAuth access token |

Ambiguity is rejected, not resolved: two different VPs, two `Authorization` headers, or a VP together with a bearer token raise `CREDENTIAL_CONFLICT`. `extract_credential(headers=None, meta=None)` exposes this lookup and returns an `ExtractedCredential` (`kind` is `"vp"` or `"oauth"`) or `None`.

A VP is verified with `verify_vp()`, so the gate makes one call to the HelixID API per tool call. The caller's scopes are the result's `effectiveScopes`.

### `MCPMiddlewareOptions`

| Option | Default | Effect |
| --- | --- | --- |
| `client` | `None` | The `HelixClient` used to verify VPs. Not needed for an OAuth-only server. |
| `expected_target_service` | `None` | This server's DID. A VP signed for another service is rejected. |
| `tool_scopes` | `None` | Per-tool required scopes. Deny by default: a tool that is not a key is rejected with `TOOL_NOT_PERMITTED`. An empty list allows any authenticated caller. |
| `required_scopes` | `[]` | Applied to every tool when `tool_scopes` is not set. |
| `allow_self_signed` | `False` | Passed to `verify_vp()`. Development only. |
| `oauth` | `None` | One `OAuthIssuerOptions` or a list. Mutually exclusive with `validate_oauth_token`. |
| `validate_oauth_token` | `None` | Your own bearer validation. Return an `AuthResult` or a dict with `sub` and `scopes`; raise to reject. |
| `audit_sink` | `None` | Receives an event for every decision about an identified caller. |
| `on_audit_error` | `None` | Called when `audit_sink` raises. An audit failure never blocks a tool call. |
| `service_did` | `None` | Included in audit events. Defaults to `expected_target_service`. |

The sync gate refuses async callbacks with a `ValueError`; use `async_helixid_mcp_middleware` for those.

### Errors

| Code | HTTP | Raised when |
| --- | --- | --- |
| `VP_MISSING` | 401 | No credential was sent. |
| `VP_INVALID_STRUCTURE` | 401 | The VP is not base64url-encoded JSON. |
| `VP_VERIFICATION_FAILED` | 401 | The API rejected the VP. |
| `OAUTH_TOKEN_INVALID` | 401 | The bearer token was rejected, or bearer tokens are not accepted. |
| `CREDENTIAL_CONFLICT` | 400 | Ambiguous credentials. |
| `INSUFFICIENT_SCOPE` | 403 | `ToolScopeError`, with `required_scope` and `required_scopes`. |
| `TOOL_NOT_PERMITTED` | 403 | The tool is not in `tool_scopes`. |

`AuthorizationServerUnavailableError` means the authorization server could not be reached or gave an unusable answer. It is a server fault, not a bad credential.

### `attach_helix_vp`

```python
from helix_mcp_middleware import AttachHelixVPOptions, attach_helix_vp

call = attach_helix_vp(
    {"name": "lookup_order", "input": {"orderId": "ORD-1001"}},
    AttachHelixVPOptions(client=client, agent_did=agent_did, target_service=service_did),
)
# call["_meta"]["x-helix-vp"] holds the encoded VP; send it as the request's params._meta
```

`AttachHelixVPOptions` takes `client`, `agent_did`, `target_service` and an optional `user_did`.

### Audit sink

```python
from helix_mcp_middleware import create_helix_audit_sink

options.audit_sink = create_helix_audit_sink(api_url, api_key, service_did=service_did)
```

`create_helix_audit_sink(base_url, api_key, service_did=None, timeout_seconds=5.0, http=None)` returns a sink that posts each decision to `POST /v1/audit-log/events`, sending `api_key` as a bearer token. OAuth callers have no agent DID, so pass `service_did` when you accept bearer tokens.

An event is a `dict` with `event` (`AUTHZ_GRANTED` or `AUTHZ_DENIED`), `result` (`allowed` or `denied`), `timestamp`, `authMethod` (`helixvp` or `oauth`), `effectiveScopes`, and when known `agentDid`, `oauthSubject`, `vpId`, `toolName`, `requiredScope`, `reason`, `serviceDid`. Any callable that takes that dict is a valid `audit_sink`.

### OAuth

```python
from helix_mcp_middleware import MCPMiddlewareOptions, OAuthIssuerOptions

options = MCPMiddlewareOptions(
    oauth=OAuthIssuerOptions(issuer="https://auth.example.com", audience="https://mcp.example.com/mcp"),
    tool_scopes={"lookup_order": ["orders:read"]},
)
```

`issuer` and `audience` alone are enough: the keys URL is read from the issuer's metadata on first use. JWTs are verified against the issuer's JWKS; opaque tokens are checked by RFC 7662 introspection.

| `OAuthIssuerOptions` field | Default | Effect |
| --- | --- | --- |
| `issuer` | required | Expected `iss`, matched exactly. |
| `audience` | required | Expected `aud`, a string or a list. |
| `jwks_uri` | `None` | Set it to skip discovery. |
| `introspection` | `None` | An `OAuthIntrospectionOptions`. Tokens are introspected. |
| `introspect_jwts` | `False` | Also introspect a JWT that passed its keys. Needs both `jwks_uri` and `introspection`. |
| `scope_claims` | `("scope", "scp")` | Claims that carry scopes; all are merged. |
| `algorithms` | RS, PS and ES 256-512, and EdDSA | Allowed JWS algorithms. `none` and HS* are never accepted. |
| `clock_tolerance_seconds` | `30.0` | Clock skew allowance. |
| `jwks_cache_ttl_seconds` | `600.0` | How long keys are cached. |
| `jwks_refetch_cooldown_seconds` | `30.0` | Minimum gap between refetches triggered by an unknown `kid`. |
| `require_access_token_type` | `False` | Require the JWT header `typ` to be `at+jwt`. |

`OAuthIntrospectionOptions(client_id, client_secret, endpoint=None, cache_ttl_seconds=60.0, allow_missing_audience=False)` holds this server's client credentials at the authorization server. Left out, `endpoint` is read from the issuer's metadata.

With a list of issuers, a JWT is routed by its `iss` claim, and an issuer not in the list is refused without a network call. Only one issuer in the list may use introspection, because an opaque token names no issuer.

Provider presets return an `OAuthIssuerOptions`:

| Preset | Notes |
| --- | --- |
| `entra(tenant_id, audience)` | Microsoft Entra ID v2.0 tokens. `tenant_id` must be the directory GUID. Reads scopes from `scp` and `roles`. JWTs only. |
| `auth0(domain, audience)` | JWTs only. |
| `okta(domain, audience, authorization_server_id="default", introspection=None, introspect_jwts=False)` | A custom authorization server. The org authorization server is not supported. |
| `keycloak(base_url, realm, audience, introspection=None, introspect_jwts=False)` | The realm's client needs an audience mapper. |

`create_oauth_validator(options)`, `create_jwt_validator(options)` and `create_introspection_validator(options)` build the validators directly. Each returns a callable that takes a token and returns an `AuthResult` (`sub`, `scopes`, `client_id`, `claims`).

### HTTP responses and protected-resource metadata

| Export | Purpose |
| --- | --- |
| `protected_resource_metadata_url(resource)` | Where RFC 9728 puts the metadata: `/.well-known/oauth-protected-resource` plus the resource's path. |
| `build_protected_resource_metadata(resource, authorization_servers=None, scopes_supported=None, resource_name=None, resource_documentation=None)` | The JSON document to serve there. |
| `to_http_error_response(error, resource_metadata_url)` | Turn a gate error into an `HttpErrorResponse` (`status`, `headers`, `body`), or `None`. |

```python
from helix_mcp_middleware import to_http_error_response, protected_resource_metadata_url

metadata_url = protected_resource_metadata_url("https://mcp.example.com/mcp")

try:
    await gate(tool_call)
except Exception as error:
    denial = to_http_error_response(error, metadata_url)
    if denial is None:
        raise                     # not the caller's fault: answer 5xx
    return JSONResponse(denial.body, status_code=denial.status, headers=denial.headers)
```

A 401 carries `WWW-Authenticate` challenges for both `Bearer` and `HelixVP`, each pointing at the metadata URL. A 403 for `INSUFFICIENT_SCOPE` also names the required scopes. `None` is returned for anything that is not about the caller's credentials, so a server fault is never reported as a 401.

## Sample: `examples/mcp_order_management`

An MCP server over Streamable HTTP with every `tools/call` gated at the HTTP layer. `initialize` and `tools/list` are not gated.

| Tool | Scope |
| --- | --- |
| `lookup_order` | `orders:read` |
| `refund_order` | `orders:admin` |

Run it from a checkout of the repository, on Python 3.10 or later:

```bash
pip install -e ".[mcp-middleware]" uvicorn
cd examples && DEMO_MODE=1 python -m mcp_order_management
```

`DEMO_MODE=1` accepts two fixed bearer tokens, `demo-reader` (`orders:read`) and `demo-admin` (both scopes), and is refused unless `HOST` is a loopback address. In another terminal:

```bash
MCP=http://localhost:3700/mcp
H=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream')
CALL='{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"refund_order","arguments":{"orderId":"ORD-1001","reason":"damaged"}}}'

curl -i "${H[@]}" $MCP -d "$CALL"                                          # 401
curl -i "${H[@]}" -H 'authorization: Bearer demo-reader' $MCP -d "$CALL"   # 403 insufficient_scope
curl    "${H[@]}" -H 'authorization: Bearer demo-admin'  $MCP -d "$CALL"   # refunded
```

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | Listen address. Default `3700` on `127.0.0.1`. |
| `MCP_RESOURCE` | Public URL of the MCP endpoint and the OAuth audience. Default `http://localhost:$PORT/mcp`. |
| `HELIX_API_URL` | The HelixID API used to verify VPs. Required whenever `HELIX_API_KEY` is set. |
| `HELIX_API_KEY` | With `HELIX_API_URL`, also writes audit events. |
| `SERVICE_DID` | This server's DID. VPs for other services are rejected. |
| `OAUTH_ISSUER` | One authorization server. Optional: `OAUTH_JWKS_URI`, `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` (introspection), `OAUTH_INTROSPECTION_URL`. |
| `OAUTH_ISSUERS` | Several authorization servers, as a JSON array of preset or custom entries. |
| `DEMO_MODE=1` | Local demo tokens instead of an authorization server. |

The repository also has `examples/verify_vp_demo.py` (onboard, sign, verify, revoke) and `examples/agent_delegation_demo.py` (delegate to a sub-agent). Both need a running HelixID API:

```bash
HELIX_API_URL=http://127.0.0.1:3579 \
HELIX_ADMIN_API_KEY=your-admin-key \
python examples/agent_delegation_demo.py
```

## Versions and breaking changes

| Version | Date | Change |
| --- | --- | --- |
| 2.1.0 | 2026-11-15 | `helix_mcp_middleware`: OAuth bearer tokens, per-tool scopes, audit sink, RFC 9728 metadata, and the order-management sample. No breaking changes. |
| 2.0.0 | 2026-10-27 | **Breaking.** `issue_grant`, `revoke_grant`, `prepare_grant`, `finalize_grant` and `IssuerKeyMaterial` are removed. Grants are issued server-side with `issue_service_delegation_grant()`. VPs travel in the `X-Helix-VP` header or MCP `_meta["x-helix-vp"]`, never in tool input. |
| 1.0.0 | 2026-09-09 | **Breaking.** `HelixClient` no longer reads `HELIX_API_URL` from the environment. Pass `base_url` explicitly; with only `api_key`, the client defaults to the hosted API. |

Python SDK version numbers do not track the JavaScript SDK's.
