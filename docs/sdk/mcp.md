---
id: mcp
title: "@helixid/mcp-middleware"
sidebar_label: "@helixid/mcp-middleware"
sidebar_position: 3
description: Reference for @helixid/mcp-middleware — the MCP auth gate, OAuth validation, RFC 9728 helpers, audit sink and client helper.
---

# `@helixid/mcp-middleware`

Server-side auth gate for **Model Context Protocol** servers — HelixID presentations and OAuth 2.1 bearer tokens,
per-tool scopes, audit — and a client-side helper that attaches a presentation to an outbound tool call. For how the
pieces fit together, see [MCP Integration](../integrations/mcp.md).

```bash
npm install @helixid/mcp-middleware @helixid/sdk-js
```

`@modelcontextprotocol/sdk` is an **optional peer dependency**: the middleware works on plain tool-call objects and never
imports it. Everything below except `helixidMCPMiddleware`'s `requiredScopes`/`allowSelfSigned`/`expectedTargetService`
and `attachHelixVP` is new in 0.4.0.

## Exports

| Export | Purpose |
| --- | --- |
| `helixidMCPMiddleware(options)` | Returns `(toolCall) => Promise<toolCall>`: authenticates the caller, authorizes the tool, audits, and resolves — or throws. |
| `attachHelixVP(toolCall, options)` | Client side: signs a VP through the HelixID API and returns the call with it in `_meta["x-helix-vp"]`. |
| `createOAuthValidator(options)` | The validator behind the `oauth` option: one trusted issuer or several, JWTs routed by `iss`, opaque tokens sent to the one issuer configured for introspection. Discovers endpoints the entry leaves out. |
| `createJwtValidator(options)` | One issuer, JWT access tokens checked against its JWKS. Needs `jwksUri`. |
| `createIntrospectionValidator(options)` | One issuer, tokens checked by RFC 7662 introspection. Needs `introspection.endpoint`. |
| `entra(options)`, `auth0(options)`, `okta(options)`, `keycloak(options)` | Provider presets: each returns an `oauth` issuer entry. See [Provider presets](#provider-presets). |
| `createHelixAuditSink(options)` | An audit sink that posts decisions to `POST /v1/audit-log/events`. |
| `protectedResourceMetadataUrl(resource)` | The RFC 9728 metadata URL for a resource: `https://host/.well-known/oauth-protected-resource/<path>`. |
| `buildProtectedResourceMetadata(input)` | The RFC 9728 metadata document to serve at that URL. |
| `toHttpErrorResponse(error, { resourceMetadataUrl })` | Maps a middleware error to `{ status, headers: { 'WWW-Authenticate' }, body }`, or `undefined` if the error is not about the caller's credentials. |
| `MCPAuthError` | Error class for `CREDENTIAL_CONFLICT`, `OAUTH_TOKEN_INVALID`, `TOOL_NOT_PERMITTED`. |
| `ToolScopeError` | The `INSUFFICIENT_SCOPE` error the middleware throws. Extends the sdk-js `InsufficientScopeError` and adds `requiredScope` (the first scope the caller lacked) and `requiredScopes` (everything the tool requires). |
| `AuthorizationServerUnavailableError` | The authorization server could not be reached or gave an unusable answer (metadata, JWKS or introspection). Not a bad credential: answer 5xx, never 401. |

Types: `MCPMiddlewareOptions`, `MCPToolCall`, `AttachHelixVPOptions`, `AuthResult`, `OAuthOptions`, `OAuthIssuerOptions`,
`OAuthJwtOptions`, `OAuthIntrospectionOptions`, `ProviderIntrospection`, `AuditSink`, `ToolAuditEvent`,
`HelixAuditSinkOptions`, `ProtectedResourceMetadata`, `ProtectedResourceMetadataInput`, `HttpErrorOptions`,
`HttpErrorResponse`, `MCPAuthErrorCode`.

## `MCPToolCall`

What the middleware inspects. Pass the request's parts; the call is returned unchanged.

| Field | Purpose |
| --- | --- |
| `name` | The tool being called. Required for `toolScopes` (a call without one is denied). |
| `input` | The tool arguments. Never read for credentials. |
| `_meta` | The MCP request's `params._meta`. Carries a VP as `_meta["x-helix-vp"]` (any transport, including stdio). |
| `headers` | HTTP request headers (a Node headers object or a `Headers` instance), when serving over HTTP. |

Credential locations, checked together: `Authorization: HelixVP <vp>`, `X-Helix-VP: <vp>`, `_meta["x-helix-vp"]` (a
VP, base64url-encoded JSON), and `Authorization: Bearer <token>` (OAuth). The scheme name is case-insensitive.

## `MCPMiddlewareOptions`

| Option | Purpose |
| --- | --- |
| `client` | `HelixClient` used to verify VPs through the HelixID API. Needed only to accept HelixID agents. |
| `toolScopes` | `Record<toolName, scopes[]>`. Deny by default: an unlisted tool is rejected; a listed tool needs every scope in its list (`[]` = any authenticated caller). Takes precedence over `requiredScopes`. |
| `requiredScopes` | Scopes required for every tool. Used only when `toolScopes` is not set. |
| `expectedTargetService` | This server's DID. A VP signed for any other service is rejected, so it cannot be replayed here. |
| `allowSelfSigned` | Accept self-issued credentials. Defaults to `false`. Development only. |
| `oauth` | Accept bearer access tokens from one trusted authorization server, or an array of them (see `OAuthIssuerOptions`). Validated with `createOAuthValidator`. |
| `validateOAuthToken` | `(token) => Promise<AuthResult>`: your own bearer validation, for credentials no standard describes (your own API keys presented as bearers). Resolve to accept, throw to reject. Use this **or** `oauth`, not both. |
| `auditSink` | `(event: ToolAuditEvent) => void \| Promise<void>`, awaited before the tool runs. |
| `onAuditError` | Called when the sink throws. The tool call still proceeds. |
| `serviceDid` | Recorded on audit events. Defaults to `expectedTargetService`. |

## `AuthResult`

What an OAuth validator resolves to.

| Field | Purpose |
| --- | --- |
| `sub` | The token's subject. Required; recorded as `oauthSubject` in audit events. |
| `scopes` | Granted scopes, compared with the tool's required scopes. |
| `clientId` | The OAuth client, if known. |
| `claims` | The full claim set, if you want it. |

## `OAuthIssuerOptions`

One trusted authorization server. The `oauth` option takes one of these or an array (`OAuthOptions`).

| Option | Default | Purpose |
| --- | --- | --- |
| `issuer` | required | Expected `iss`. Must match the token's claim exactly, including any trailing slash. |
| `audience` | required | Expected `aud` (string or list): this server's resource identifier. |
| `jwksUri` | from metadata | The authorization server's `jwks_uri`. Must be `https`, except on a loopback host. |
| `introspection` | none | `{ clientId, clientSecret, endpoint?, cacheTtlMs?, allowMissingAudience? }`: check tokens by RFC 7662 introspection. See below. |
| `introspectJwts` | `false` | With both `jwksUri` and `introspection`: after a JWT's signature and claims check out, also introspect it, so a token revoked at the authorization server is refused before it expires. |
| `scopeClaims` | `['scope', 'scp']` | The claims that carry granted scopes. All listed are merged; each may be a space-separated string or an array. |
| `requireAccessTokenType` | `false` | Require the JWT header `typ` to be `at+jwt` (RFC 9068), so an ID token with a matching audience is not accepted as an access token. |
| `algorithms` | RS/PS/ES 256–512, EdDSA | Allowed signing algorithms. `none` and `HS*` are never accepted. |
| `clockToleranceSeconds` | `30` | Allowed skew for `exp` and `nbf`. |
| `jwksCacheTtlMs` | 10 minutes | How long fetched keys are trusted. |
| `jwksRefetchCooldownMs` | 30 seconds | Minimum gap between refetches triggered by an unknown `kid` (key rotation). |

`OAuthJwtOptions` is this shape with `jwksUri` required: the original `oauth` form, still accepted.

**`{ issuer, audience }` is enough.** What the entry asks for decides how tokens are checked:

- `jwksUri`, or nothing at all: JWTs are verified against the issuer's keys.
- `introspection`: tokens are introspected. With `jwksUri` as well, JWTs are still verified by keys alone unless `introspectJwts` is set.

A URL the entry leaves out (`jwks_uri`, or `introspection_endpoint` when `introspection` has no `endpoint`) is read from the issuer's metadata: `<issuer>/.well-known/openid-configuration` or the RFC 8414 `oauth-authorization-server` document. It is fetched on first use, kept, and retried on the next token if the lookup failed. The issuer must then be `https` (or loopback).

**Several issuers.** A JWT is routed to its issuer by its `iss` claim, before verification, and that issuer's validator re-checks `iss` on the verified claims. An issuer not in the list is refused before any request is sent to an authorization server. A token that is not a JWT is opaque and names no issuer, so it goes to the one issuer configured for introspection. Only one issuer may have `introspection`; construction throws otherwise, as it does for an empty list or an issuer listed twice.

JWT validation checks the signature, `iss`, `aud`, `exp` (required), `nbf` (if present) and `sub` (required). The client is read from `client_id` or `azp`. Tokens with a `crit` header are rejected.

### `OAuthIntrospectionOptions`

| Option | Default | Purpose |
| --- | --- | --- |
| `clientId`, `clientSecret` | required | This server's own client credentials at the authorization server, sent as HTTP Basic. |
| `endpoint` | from metadata | The `introspection_endpoint`. Must be `https`, except on a loopback host. `createIntrospectionValidator` needs it given; `createOAuthValidator` can discover it. |
| `cacheTtlMs` | 60 seconds | How long a positive answer is reused, never past the token's `exp`. `0` disables the cache. "Not active" answers and failures are not cached. |
| `allowMissingAudience` | `false` | Accept an active token whose introspection response has no `aud`. Off by default: without an audience there is no proof the token was issued for this server. |

An introspected token must be reported `active`, must not be reported as another token type (`token_type` other than `bearer` or `access_token`), and passes the same issuer, audience, expiry and not-before checks. Its subject is `sub`, or `client_id` when there is no `sub`.

Introspection needs this server's own client at the authorization server, so it fits a tenant you run. Tokens from another organisation's tenant can only be verified by public keys, as JWTs.

### Provider presets

There is no provider-wide default: every customer of Auth0, Okta, Entra or Keycloak has their own authorization server, and trusting "Auth0" would accept tokens issued in anyone's tenant. A preset takes the values that name **your** tenant and fills in that provider's exact issuer string and endpoints.

| Preset | You give | Tokens | Notes |
| --- | --- | --- | --- |
| `entra` | `tenantId`, `audience` | JWT | v2.0 access tokens. `tenantId` must be the directory ID (a GUID), not `common`. `audience` is the API's application ID. Scopes are read from `scp` and `roles`. |
| `auth0` | `domain`, `audience` | JWT | The issuer ends with a slash. Clients must request the API audience, or Auth0 issues an opaque token this server cannot check. |
| `okta` | `domain`, `audience`, `authorizationServerId?`, `introspection?`, `introspectJwts?` | JWT, opaque | A custom authorization server (`default` unless named), not the org authorization server. |
| `keycloak` | `baseUrl`, `realm`, `audience`, `introspection?`, `introspectJwts?` | JWT, opaque | Add an audience mapper to the realm's client so `aud` names this server. |

For `okta` and `keycloak`, `introspection` is `{ clientId, clientSecret }` plus the optional cache settings; the preset supplies the endpoint.

```typescript
import { helixidMCPMiddleware, entra, okta } from '@helixid/mcp-middleware';

const requireHelix = helixidMCPMiddleware({
  toolScopes: { lookup_order: ['orders:read'] },
  oauth: [
    entra({ tenantId: '<directory id>', audience: '<API application id>' }),
    okta({ domain: 'dev-1.okta.com', audience: resource, introspection: { clientId: '...', clientSecret: '...' } }),
    { issuer: 'https://as.example.com', audience: resource },
  ],
});
```

## Errors

| `code` | Thrown when | `toHttpErrorResponse` |
| --- | --- | --- |
| `VP_MISSING` | No credential anywhere. | 401, challenges without an error code |
| `VP_INVALID_STRUCTURE` | A VP that is not base64url JSON, or a non-string `_meta` value. | 401 `invalid_token` |
| `VP_VERIFICATION_FAILED` | The HelixID API did not verify the VP (signature, chain, expiry, target service, revocation). | 401 `invalid_token` |
| `OAUTH_TOKEN_INVALID` | A bearer token failed validation, or bearer tokens are not configured. | 401 `invalid_token` |
| `CREDENTIAL_CONFLICT` | Different VPs in different places, two `Authorization` headers, or a VP plus a bearer token. | 400 `invalid_request` |
| `INSUFFICIENT_SCOPE` | The caller lacks a required scope (`ToolScopeError`). | 403 `insufficient_scope`, with `scope="…"` |
| `TOOL_NOT_PERMITTED` | `toolScopes` is set and the tool is not in it. | 403 `insufficient_scope` |

Every mapped response carries two challenges in one `WWW-Authenticate` header, `Bearer …` and `HelixVP …`, each with
`resource_metadata`. On a missing scope, each challenge also carries `scope="…"` listing every scope the tool requires
(RFC 6750), so a client can ask its authorization server for them and retry once.

Other errors map to `undefined`: handle them as server errors. That includes `AuthorizationServerUnavailableError`,
thrown when the authorization server's metadata, JWKS or introspection endpoint cannot be reached or returns something
unusable. The caller's token was not shown to be bad, so answer 5xx, never 401.

## `ToolAuditEvent`

| Field | Value |
| --- | --- |
| `event` / `result` | `AUTHZ_GRANTED` / `allowed`, or `AUTHZ_DENIED` / `denied` |
| `timestamp`, `authMethod` | ISO time; `helixvp` or `oauth` |
| `agentDid`, `vpId` | HelixID callers |
| `oauthSubject` | OAuth callers |
| `toolName`, `requiredScope` | The tool; on a denial, the scope that was missing |
| `effectiveScopes`, `reason` | The caller's scopes; why it was denied |
| `serviceDid` | This server |

Only identified callers produce events. `createHelixAuditSink({ baseUrl, apiKey, serviceDid?, timeoutMs? })` posts them
with `Authorization: Bearer <apiKey>` and `source: "mcp-middleware"`; an OAuth event needs a `serviceDid`.

## `AttachHelixVPOptions`

| Option | Required | Purpose |
| --- | --- | --- |
| `client` | Yes | `HelixClient`; the VP is signed by the HelixID API, which holds the agent's keys. |
| `agentDid` | Yes | The agent presenting. |
| `targetService` | Yes | Binds the VP to one verifier — the service's DID when it checks `expectedTargetService`. |
| `userDid` | No | The user on whose behalf the agent is acting. |

```typescript
const call = await attachHelixVP(
  { name: 'lookup_order', input: { orderId: 'ORD-1001' } },
  { client, agentDid, targetService: 'did:web:mcp.example.com' },
);
await mcpClient.callTool({ name: call.name!, arguments: call.input, _meta: call._meta });
```

The input is left untouched; only `_meta` changes.
