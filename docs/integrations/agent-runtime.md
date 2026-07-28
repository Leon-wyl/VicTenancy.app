# Agent Runtime Integration

## Overview

The Agent Runtime is a LangGraph/RAG compliance agent owned by the
**[AusTenancy.ai](https://github.com/Leon-wyl/AusTenancy.ai)** repository.
It is a separate FastAPI/Mangum service deployed on AWS Lambda behind API Gateway.

**Current status:** Integration is deferred to Step 16 (Async Agent Orchestration).
No runtime dependency exists today. The CRUD API creates `agent_jobs` records but
does not invoke the Agent Runtime.

## API Contract

The canonical API contract is versioned and maintained in the AusTenancy.ai repository.
See [`docs/api/agent-runtime-api.md`](https://github.com/Leon-wyl/AusTenancy.ai/blob/main/docs/api/agent-runtime-api.md).

### Summary

| Method | Path | Auth (local) | Auth (deployed) |
|---|---|---|---|
| `GET` | `/health` | NONE | NONE |
| `POST` | `/api/agent/invoke` | NONE | AWS_IAM (SigV4) |

### Request (`AgentRequest`)

| Field | Type | Required | Constraints |
|---|---|---|---|
| `question` | `str` | Yes | `min_length=1`, `max_length=4000` |
| `jurisdiction` | `str \| None` | No | `^(VIC\|NSW)?$` |
| `api_version` | `str` | No | `^\d+\.\d+$`, default `"1.0"` |
| `request_id` | `str` | No | Auto-generated UUID |
| `thread_id` | `str \| None` | No | For future multi-turn support |
| `user_id` | `str \| None` | No | — |
| `conversation_id` | `str \| None` | No | — |
| `message_id` | `str \| None` | No | Auto-generated UUID |

### Response (`AgentResponse`)

| Field | Type | Description |
|---|---|---|
| `request_id` | `str` | Echoed from request |
| `status` | `"success" \| "fallback" \| "clarification"` | Agent outcome |
| `answer` | `str \| None` | Final answer (with legal disclaimer) |
| `verified_citations` | `list[str]` | Verified citation strings |
| `citation_verified_rate` | `float \| None` | Proportion verified |
| `clarification` | `str \| None` | Present only when `status == "clarification"` |
| `fallback_reason` | `str \| None` | Present only when `status == "fallback"` |
| `selected_jurisdiction` | `str \| None` | Detected jurisdiction |
| `latency_ms` | `float \| None` | Wall-clock latency |
| `api_version` | `str` | Always `"1.0"` |
| `generated_at` | `str` | ISO-8601 UTC timestamp |

### Errors

| Status | Cause |
|---|---|
| 422 | Pydantic validation failure (invalid question, jurisdiction, etc.) |
| 500 | Graph invocation failure (internal error) |
| 403 | Deployed: request lacks valid SigV4 signature |

## Local Development (Agent Runtime)

The Agent Runtime can run locally for integration testing. This requires the
AusTenancy.ai repository and its dependencies (Python 3.12+, Qdrant seed data).

```bash
# In the AusTenancy.ai repo
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set DEEPSEEK_API_KEY in .env

# Start the ASGI server (port 8080)
uvicorn src.api.runtime:app --host 0.0.0.0 --port 8080
```

Local endpoints:
- Health: `GET http://localhost:8080/health`
- Agent invoke: `POST http://localhost:8080/api/agent/invoke`

## Deployed Access

The production Agent Runtime is deployed on AWS Lambda with AWS_IAM authorization
on the invoke route. Consumer applications must sign requests with SigV4 credentials.

**Browser code must never call the deployed Agent Runtime endpoint directly.**

## Ownership Boundaries

1. The Agent Runtime API contract is owned by AusTenancy.ai. This document is a
   consumer reference only.
2. The CRUD API creates `agent_jobs` records. Agent invocation is done by a worker
   in Step 16, not from CRUD endpoints.
3. AWS credentials, Bedrock model access, Qdrant seed data, and FastEmbed caches
   are Agent Runtime concerns and are never placed in this repository.

## Deferred Work

| Capability | Step | Notes |
|---|---|---|
| Agent invocation | 16 | Worker invokes Agent Runtime server-to-server |
| JWT authorizer on invoke | Phase E | May replace AWS_IAM with Supabase JWT |

See the [Phase E Boundaries](../phase-e/boundaries.md) for cross-repository contract rules.
See the [Phase E Roadmap](../phase-e/README.md) for full delivery order.
