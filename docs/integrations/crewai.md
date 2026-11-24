---
id: crewai
title: CrewAI
sidebar_label: CrewAI
sidebar_position: 3
description: Wire HelixID into a CrewAI crew so every tool call carries a presentation signed for the service it calls.
---

# CrewAI

The `helix_crewai` package does two things: it gets a signed presentation for every tool call the agent makes, and it hides tools the agent has no scope for. It ships inside the [Python SDK](../sdk/sdk-py.md); CrewAI is Python-only, so there is no JavaScript counterpart.

```bash
pip install "helixid-sdk-py[crewai]"
```

The extra installs `crewai>=1.0` and needs Python 3.10 or later.

## Attaching a presentation to tool calls

```python
helix_id_crewai_tool(tool, client, agent_did, target_service, user_did=None) -> BaseTool
```

`helix_id_crewai_tool` wraps a `crewai.tools.BaseTool`. On every invocation the wrapper calls `client.sign_vp(agent_did, target_service, user_did=user_did)`, then runs the original tool's `_run` with its arguments unchanged.

| Argument | Meaning |
| --- | --- |
| `tool` | The tool to wrap. The wrapper keeps its `name`, `description` and `args_schema`. |
| `client` | A `HelixClient` that is allowed to sign for the agent. |
| `agent_did` | The agent's DID, from onboarding. |
| `target_service` | The DID of the service the tool calls. |
| `user_did` | Optional. The user the agent is acting for. |

```python
from helix_crewai import helix_id_crewai_tool

protected = helix_id_crewai_tool(lookup_order, client, agent_did, service_did)
```

## How the VP reaches the service

The VP is not put in the tool's arguments, so the model never sees it. For the duration of the call it is held in a context variable, and the tool reads it with `current_helix_vp_headers()`:

```python
from helix_crewai import current_helix_vp_headers

headers = current_helix_vp_headers()   # {"X-Helix-VP": "<base64url VP>"}
```

The tool sends those headers with its outbound request. Outside a wrapped call the function returns an empty dict, so an unwrapped tool sends no credential.

## What the server signs

The agent process holds no key. `sign_vp()` is a `POST /v1/agents/:did/vp` request with `{ targetService, userDid? }`, and HelixID signs with the agent key it keeps. On a self-hosted server that route needs the admin API key, so construct the client with `admin_api_key`.

- The presentation is bound to `target_service`, which must be the service's DID, and lives for five minutes.
- It carries every active `HelixAgentCredential` the agent holds: its own, and any delegated to it.
- With `user_did`, it also carries every active `DelegationGrantCredential` that service issued to this agent for that user. If the user has not consented yet, signing raises an error with code `CONSENT_GRANT_NOT_FOUND`.

Each tool call is one signing request, so each call gets a fresh VP.

## Filtering tools by scope

```python
filter_crewai_tools_by_scope(tools, client, agent_did) -> list
```

CrewAI's `BaseTool` has no metadata field, so the filter reads a plain `required_scope` attribute. A tool without one is kept. The agent's scopes come from one `client.list_vcs(subject_did=agent_did, status="active")` call; the filter raises `RuntimeError` when the agent has no active credential.

```python
from helix_crewai import filter_crewai_tools_by_scope

allowed = filter_crewai_tools_by_scope([lookup_order, refund_order], client, agent_did)
```

Filtering removes tools from the model's choices, so it does not propose a call that is going to be refused.

:::note[Filter first, then wrap]
The wrapper does not copy `required_scope`. Run `filter_crewai_tools_by_scope` on the original tools and wrap what is left; a wrapped tool has no `required_scope`, so the filter would keep it.
:::

:::note[Filtering is convenience; verification is enforcement]
The filter runs in the agent's own process. It is not a security boundary. The service still verifies the presentation and enforces scopes on its side — see [Authorization & Scopes](../concepts/authorization-and-scopes.md).
:::

## A minimal end-to-end example

The agent side: define a tool, filter, wrap, and hand it to the crew.

```python
import os
import requests
from crewai import Agent
from crewai.tools import BaseTool
from helix_sdk import HelixClient
from helix_crewai import (
    current_helix_vp_headers,
    filter_crewai_tools_by_scope,
    helix_id_crewai_tool,
)

ORDERS_API = os.environ["ORDERS_API"]
SERVICE_DID = os.environ["SERVICE_DID"]      # the orders service's DID
AGENT_DID = os.environ["AGENT_DID"]          # from client.onboard_agent()


class LookupOrder(BaseTool):
    name: str = "lookup_order"
    description: str = "Look up an order by id."
    required_scope: str = "orders:read"

    def _run(self, order_id: str) -> str:
        res = requests.get(
            f"{ORDERS_API}/orders/{order_id}",
            headers=current_helix_vp_headers(),
        )
        return res.text


client = HelixClient(os.environ["HELIX_API_URL"], admin_api_key=os.environ["HELIX_ADMIN_API_KEY"])

allowed = filter_crewai_tools_by_scope([LookupOrder()], client, AGENT_DID)
tools = [helix_id_crewai_tool(tool, client, AGENT_DID, SERVICE_DID) for tool in allowed]

support_agent = Agent(
    role="Support agent",
    goal="Answer questions about orders",
    backstory="Handles order lookups for the support team.",
    tools=tools,
)
```

The service side: read the header, verify, enforce the scope.

```python
from helix_sdk import HelixClient, HelixError, read_helix_vp_header, require_scope, verify_vp

verifier = HelixClient(os.environ["HELIX_API_URL"])


def authorize(headers, required_scope: str) -> dict:
    vp = read_helix_vp_header(headers)
    if vp is None:
        raise PermissionError("No X-Helix-VP header")
    result = verify_vp(vp, verifier, expected_target_service=SERVICE_DID)
    if not result.get("valid"):
        raise PermissionError(result.get("error") or "VP rejected")
    require_scope(result, required_scope)
    return result
```

`verify_vp()` is a `POST /v1/vp/verify` request to the HelixID API the service chose. A rejected credential usually arrives as a raised `HelixError` with a specific `code`, and `require_scope()` raises `InsufficientScopeError`; turn both into a 401 or 403 in your handler. A VP is not single-use, so track `result["vpId"]` yourself if you need replay protection.

If the tools are exposed over MCP instead of plain HTTP, gate them with [`helix_mcp_middleware`](../sdk/sdk-py.md#helix_mcp_middleware).

## Acting for a user

Pass `user_did` to send the user's consent grants with the agent's own credential:

```python
tool = helix_id_crewai_tool(
    LookupOrder(), client, AGENT_DID, SERVICE_DID,
    user_did="did:web:user.example.com",
)
```

The service issues the grant beforehand with `client.issue_service_delegation_grant()`. See the [Python SDK reference](../sdk/sdk-py.md#services-and-consent-grants) and the [Two-Issuer Model](../concepts/two-issuer-model.md).
